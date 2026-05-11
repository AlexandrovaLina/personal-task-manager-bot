#!/usr/bin/env python3
"""Fetch subtasks of a Jira issue."""

import json, os, sys, base64
import urllib.request
import urllib.error

email = os.environ['JIRA_EMAIL']
token = os.environ['JIRA_API_TOKEN']
base_url = os.environ.get('JIRA_BASE_URL', 'https://workaxle.atlassian.net')

auth = base64.b64encode(f"{email}:{token}".encode()).decode()
headers = {'Authorization': f'Basic {auth}', 'Content-Type': 'application/json'}

if len(sys.argv) < 2:
    print("Использование: /subtasks <ключ задачи>")
    sys.exit(1)

issue_key = sys.argv[1]

try:
    req = urllib.request.Request(
        f'{base_url}/rest/api/3/issue/{issue_key}?fields=summary,subtasks',
        headers=headers
    )
    data = json.loads(urllib.request.urlopen(req).read())
except urllib.error.HTTPError as e:
    if e.code == 404:
        print(f"Задача {issue_key} не найдена")
    else:
        print(f"Ошибка: HTTP {e.code}")
    sys.exit(1)

summary = data['fields']['summary']
subtasks = data['fields'].get('subtasks', [])

print(f"*{issue_key}: {summary}*\n")

if not subtasks:
    print("Дочерних задач нет.")
    sys.exit(0)

print(f"*Подзадачи ({len(subtasks)}):*\n")

for s in subtasks:
    key = s['key']
    s_summary = s['fields']['summary']
    status = s['fields']['status']['name']
    try:
        req2 = urllib.request.Request(
            f'{base_url}/rest/api/3/issue/{key}?fields=assignee',
            headers=headers
        )
        d = json.loads(urllib.request.urlopen(req2).read())
        assignee = d['fields'].get('assignee')
        assignee_name = assignee.get('displayName', 'Не назначен') if assignee else 'Не назначен'
        assignee_email = assignee.get('emailAddress', '') if assignee else ''
        mine = ' ← МОЯ' if assignee_email == email else ''
    except:
        assignee_name = '?'
        mine = ''
    print(f"• [{key}] {s_summary} | {status} | {assignee_name}{mine}")
