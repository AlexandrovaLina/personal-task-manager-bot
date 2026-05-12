#!/usr/bin/env python3
import json, os, urllib.request, urllib.parse, base64, time
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

email = os.environ['JIRA_EMAIL']
token = os.environ['JIRA_API_TOKEN']
base_url = os.environ.get('JIRA_BASE_URL', 'https://workaxle.atlassian.net')
MY_ACCOUNT_ID = os.environ.get('JIRA_USER_ACCOUNT_ID', '')

auth = base64.b64encode(f"{email}:{token}".encode()).decode()
headers = {'Authorization': f'Basic {auth}', 'Accept': 'application/json', 'Content-Type': 'application/json'}

HOURS = 72 if datetime.now().weekday() == 0 else 24

class FollowRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, newheaders, newurl):
        return urllib.request.Request(newurl, data=req.data, headers=dict(req.headers), method=req.get_method())

opener = urllib.request.build_opener(FollowRedirectHandler)

def request_with_retry(req, retries=3, delay=2):
    for attempt in range(retries):
        try:
            return opener.open(req)
        except Exception as error:
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                raise error

def search(jql, fields):
    url = f'{base_url}/rest/api/3/search/jql'
    body = json.dumps({'jql': jql, 'maxResults': 50, 'fields': fields}).encode()
    try:
        req = urllib.request.Request(url, data=body, headers=headers)
        return json.loads(request_with_retry(req).read()).get('issues', [])
    except Exception as e:
        raise Exception(f'Search failed: {url} — {e}') from e

def get_issue(key):
    req = urllib.request.Request(f'{base_url}/rest/api/3/issue/{key}?expand=changelog&fields=comment', headers=headers)
    return json.loads(request_with_retry(req).read())

def get_prs(issue_id):
    try:
        req = urllib.request.Request(
            f'{base_url}/rest/dev-status/1.0/issue/detail?issueId={issue_id}&applicationType=GitHub&dataType=pullrequest',
            headers=headers)
        data = json.loads(request_with_retry(req).read())
        return [{'url': pr['url'], 'status': pr['status']} for pr in data.get('detail', [{}])[0].get('pullRequests', [])]
    except:
        return []

def fmt_prs(prs):
    if not prs:
        return ''
    return ', '.join(f"[{pr['status'].upper()}]({pr['url']})" for pr in prs)

def extract_text(node):
    if isinstance(node, dict):
        if node.get('type') == 'text':
            return node.get('text', '')
        return ' '.join(extract_text(c) for c in node.get('content', []))
    return ''

since = (datetime.now(timezone.utc) - timedelta(hours=HOURS)).isoformat()
label = 'пятница–воскресенье (72ч)' if HOURS == 72 else 'последние 24ч'
issue_url = lambda key: f'https://workaxle.atlassian.net/browse/{key}'

with ThreadPoolExecutor(max_workers=3) as pool:
    future_created = pool.submit(search,
        f'assignee = "{email}" AND created >= -{HOURS}h ORDER BY created DESC',
        ['summary', 'status', 'priority', 'id'])
    future_candidates = pool.submit(search,
        f'assignee = "{email}" AND updated >= -{HOURS}h AND created < -{HOURS}h ORDER BY updated DESC',
        ['summary', 'status', 'priority', 'id'])
    future_rtm = pool.submit(search,
        f'assignee = "{email}" AND status = "Ready to Merge" ORDER BY updated DESC',
        ['summary', 'status', 'priority', 'id'])

    created = future_created.result()
    candidates = future_candidates.result()
    rtm = future_rtm.result()

full_issues = {}
prs_map = {}
early_pr_ids = list({i['id'] for i in created + rtm})

with ThreadPoolExecutor(max_workers=16) as pool:
    pr_futures = {pool.submit(get_prs, issue_id): issue_id for issue_id in early_pr_ids}
    issue_futures = {pool.submit(get_issue, issue['key']): issue['key'] for issue in candidates}

    for future in as_completed({**pr_futures, **issue_futures}):
        if future in pr_futures:
            prs_map[pr_futures[future]] = future.result()
        else:
            full_issues[issue_futures[future]] = future.result()

updated_rows = []
reassigned = []
for issue in candidates:
    full = full_issues.get(issue['key'], {})
    changed = False
    was_reassigned = False
    comments = []
    for hist in full.get('changelog', {}).get('histories', []):
        if hist['created'] >= since:
            for item in hist['items']:
                if item['field'] == 'status':
                    changed = True
                elif item['field'] == 'assignee' and MY_ACCOUNT_ID and item.get('to') == MY_ACCOUNT_ID:
                    was_reassigned = True
    for c in full.get('fields', {}).get('comment', {}).get('comments', []):
        if c['created'] >= since:
            changed = True
            author = c.get('author', {}).get('displayName', '')
            full_text = extract_text(c.get('body', {}))
            text = full_text[:300] + ('…✂️' if len(full_text) > 300 else '')
            comments.append(f"{text} ({author})")
    if was_reassigned:
        reassigned.append(issue)
    elif changed:
        updated_rows.append({'issue': issue, 'comments': comments})

all_created = created + reassigned

updated_pr_ids = list({row['issue']['id'] for row in updated_rows} - prs_map.keys())
if updated_pr_ids:
    with ThreadPoolExecutor(max_workers=8) as pool:
        future_to_id = {pool.submit(get_prs, issue_id): issue_id for issue_id in updated_pr_ids}
        for future in as_completed(future_to_id):
            prs_map[future_to_id[future]] = future.result()

print(f'*Jira — обновления за последние {HOURS} часов*\n')
print(f'*За период:* {label}\n')

print(f'*Созданные задачи ({len(all_created)})*')
if all_created:
    for idx, i in enumerate(all_created, 1):
        f = i['fields']
        prs = fmt_prs(prs_map.get(i['id'], []))
        print(f"{idx}. [{i['key']}]({issue_url(i['key'])}) — {f['summary']}")
        print(f"   📊 {f['status']['name']} | ⚡ {f['priority']['name']}")
        if prs:
            print(f"   🔗 PR: {prs}")
        print()
else:
    print('Нет новых задач.')

print()

print(f'*Обновлённые задачи ({len(updated_rows)})*')
if updated_rows:
    for idx, row in enumerate(updated_rows, 1):
        i = row['issue']
        f = i['fields']
        prs = fmt_prs(prs_map.get(i['id'], []))
        print(f"{idx}. [{i['key']}]({issue_url(i['key'])}) — {f['summary']}")
        print(f"   📊 {f['status']['name']} | ⚡ {f['priority']['name']}")
        if prs:
            print(f"   🔗 PR: {prs}")
        if row['comments']:
            for c in row['comments']:
                print(f"   💬 {c}")
        print()
else:
    print('Нет обновлённых задач.')

print()

print(f'*Ready to Merge ({len(rtm)})*')
if rtm:
    for idx, i in enumerate(rtm, 1):
        f = i['fields']
        prs = fmt_prs(prs_map.get(i['id'], []))
        print(f"{idx}. [{i['key']}]({issue_url(i['key'])}) — {f['summary']}")
        print(f"   ⚡ {f['priority']['name']}")
        if prs:
            print(f"   🔗 PR: {prs}")
        print()
else:
    print('Нет задач в статусе Ready to Merge.')
