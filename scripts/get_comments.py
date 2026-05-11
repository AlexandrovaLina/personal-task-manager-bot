#!/usr/bin/env python3
"""Fetch comments for a Jira issue."""

import json, os, sys, base64
import urllib.request
import urllib.error

email = os.environ['JIRA_EMAIL']
token = os.environ['JIRA_API_TOKEN']
base_url = os.environ.get('JIRA_BASE_URL', 'https://workaxle.atlassian.net')

auth = base64.b64encode(f"{email}:{token}".encode()).decode()
headers = {'Authorization': f'Basic {auth}', 'Content-Type': 'application/json'}


def extract_text(node):
    if isinstance(node, dict):
        if node.get('type') == 'text':
            return node.get('text', '')
        if node.get('type') == 'hardBreak':
            return '\n'
        text = ''
        for child in node.get('content', []):
            text += extract_text(child)
        if node.get('type') in ('paragraph', 'heading'):
            text += '\n'
        return text
    return ''


if len(sys.argv) < 2:
    print("Использование: /comments <ключ задачи>")
    sys.exit(1)

issue_key = sys.argv[1]

try:
    req = urllib.request.Request(
        f'{base_url}/rest/api/3/issue/{issue_key}?fields=summary,comment',
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
print(f"*{issue_key}: {summary}*\n")

comments = data['fields'].get('comment', {}).get('comments', [])
print(f"*Комментарии ({len(comments)}):*\n")

if not comments:
    print("Комментариев нет.")
    sys.exit(0)

for c in comments:
    author = c['author']['displayName']
    created = c['created'][:10]
    text = extract_text(c['body']).strip()[:500]
    print(f"*{author}* ({created}):")
    print(text)
    print()
