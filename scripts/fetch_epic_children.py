#!/usr/bin/env python3
"""Fetch all children of an epic via JQL."""

import json, os, sys, base64
import urllib.request
import urllib.error

email = os.environ['JIRA_EMAIL']
token = os.environ['JIRA_API_TOKEN']
base_url = os.environ.get('JIRA_BASE_URL', 'https://workaxle.atlassian.net')

auth = base64.b64encode(f"{email}:{token}".encode()).decode()
headers = {'Authorization': f'Basic {auth}', 'Content-Type': 'application/json'}

if len(sys.argv) < 2:
    print("Использование: /epic <ключ эпика>")
    sys.exit(1)

epic_key = sys.argv[1]

jql = f'parent = {epic_key} ORDER BY rank ASC'
body = json.dumps({
    'jql': jql,
    'fields': ['summary', 'status', 'priority', 'assignee', 'issuetype'],
    'maxResults': 100
}).encode()

try:
    req = urllib.request.Request(
        f'{base_url}/rest/api/3/search/jql',
        data=body, headers=headers, method='POST'
    )
    data = json.loads(urllib.request.urlopen(req).read())
except urllib.error.HTTPError as e:
    if e.code == 400:
        print(f"Задача {epic_key} не найдена или не является эпиком")
    else:
        print(f"Ошибка: HTTP {e.code}")
    sys.exit(1)

issues = data.get('issues', [])
print(f"*Дети эпика {epic_key} ({len(issues)}):*\n")

if not issues:
    print("Дочерних задач нет.")
    sys.exit(0)

for it in issues:
    key = it['key']
    f = it['fields']
    summary = f.get('summary', '')
    status = f.get('status', {}).get('name', 'N/A')
    priority = f.get('priority', {}).get('name', 'N/A')
    assignee = f.get('assignee')
    aname = assignee.get('displayName', 'Не назначен') if assignee else 'Не назначен'
    browse_url = f"https://workaxle.atlassian.net/browse/{key}"
    print(f"• [{key}]({browse_url}) | {status} | {priority} | {aname}")
    print(f"  {summary}\n")
