#!/usr/bin/env python3
"""Fetch a Jira issue and print its details."""

import base64, json, os, sys
import urllib.request
import urllib.error


def get_auth():
    email = os.environ['JIRA_EMAIL']
    token = os.environ['JIRA_API_TOKEN']
    base_url = os.environ.get('JIRA_BASE_URL', 'https://workaxle.atlassian.net')
    auth = f"Basic {base64.b64encode(f'{email}:{token}'.encode()).decode()}"
    return base_url, auth


def adf_to_text(node, indent=0):
    if node is None:
        return ""
    node_type = node.get("type", "")
    content = node.get("content", [])
    text = node.get("text", "")

    if node_type == "hardBreak":
        return "\n"
    if node_type == "text":
        return text
    if node_type == "paragraph":
        return "".join(adf_to_text(c) for c in content) + "\n"
    if node_type == "heading":
        level = node.get("attrs", {}).get("level", 1)
        return "#" * level + " " + "".join(adf_to_text(c) for c in content) + "\n"
    if node_type == "bulletList":
        return "\n".join("  " * indent + "• " + adf_to_text(item, indent + 1).strip() for item in content) + "\n"
    if node_type == "orderedList":
        return "\n".join("  " * indent + f"{i}. " + adf_to_text(item, indent + 1).strip() for i, item in enumerate(content, 1)) + "\n"
    if node_type == "listItem":
        return "".join(adf_to_text(c, indent) for c in content)
    if node_type == "codeBlock":
        lang = node.get("attrs", {}).get("language", "")
        inner = "".join(adf_to_text(c) for c in content)
        return f"```{lang}\n{inner}\n```\n"
    if node_type == "inlineCard":
        return node.get("attrs", {}).get("url", "")
    if node_type == "mention":
        return node.get("attrs", {}).get("text", "")
    if node_type in ("doc", "blockquote", "tableRow", "tableCell", "tableHeader"):
        return "".join(adf_to_text(c, indent) for c in content)
    return "".join(adf_to_text(c, indent) for c in content)


def main():
    if len(sys.argv) < 2:
        print("Использование: /issue <ключ задачи>")
        sys.exit(1)

    issue_key = sys.argv[1]
    base_url, auth = get_auth()

    url = f"{base_url}/rest/api/3/issue/{issue_key}?expand=renderedFields&fields=summary,status,issuetype,priority,assignee,reporter,comment,subtasks,issuelinks,description"
    req = urllib.request.Request(url, headers={"Authorization": auth, "Accept": "application/json"})

    try:
        data = json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"Задача {issue_key} не найдена")
        else:
            print(f"Ошибка: HTTP {e.code}")
        sys.exit(1)

    fields = data.get("fields", {})
    browse_url = f"https://workaxle.atlassian.net/browse/{issue_key}"

    summary = fields.get("summary", "N/A")
    status = fields.get("status", {}).get("name", "N/A")
    issue_type = fields.get("issuetype", {}).get("name", "N/A")
    priority = (fields.get("priority") or {}).get("name", "N/A")
    assignee = (fields.get("assignee") or {}).get("displayName", "Не назначен")
    reporter = (fields.get("reporter") or {}).get("displayName", "N/A")

    print(f"*{issue_key}: {summary}*")
    print(f"🔗 {browse_url}\n")
    print(f"Статус: {status}")
    print(f"Тип: {issue_type}")
    print(f"Приоритет: {priority}")
    print(f"Исполнитель: {assignee}")
    print(f"Автор: {reporter}")

    desc_adf = fields.get("description")
    if desc_adf:
        desc_text = adf_to_text(desc_adf).strip()[:2000]
        print(f"\n*Описание:*\n{desc_text}")

    subtasks = fields.get("subtasks", [])
    if subtasks:
        print(f"\n*Подзадачи ({len(subtasks)}):*")
        for st in subtasks:
            st_key = st.get("key", "")
            st_summary = st.get("fields", {}).get("summary", "")
            st_status = st.get("fields", {}).get("status", {}).get("name", "")
            print(f"  • [{st_key}] ({st_status}) {st_summary}")

    links = fields.get("issuelinks", [])
    if links:
        print(f"\n*Связи ({len(links)}):*")
        for link in links:
            if "outwardIssue" in link:
                direction = link.get("type", {}).get("outward", "relates to")
                linked = link["outwardIssue"]
            elif "inwardIssue" in link:
                direction = link.get("type", {}).get("inward", "is related to")
                linked = link["inwardIssue"]
            else:
                continue
            l_key = linked.get("key", "")
            l_summary = linked.get("fields", {}).get("summary", "")
            l_status = linked.get("fields", {}).get("status", {}).get("name", "")
            print(f"  • {direction}: [{l_key}] ({l_status}) {l_summary}")

    comments_data = fields.get("comment", {}).get("comments", [])
    if comments_data:
        last_3 = comments_data[-3:]
        print(f"\n*Последние комментарии ({len(comments_data)} всего):*")
        for c in last_3:
            author = (c.get("author") or {}).get("displayName", "Unknown")
            created = c.get("created", "")[:10]
            body_text = adf_to_text(c.get("body")).strip()[:300]
            print(f"\n{author} ({created}):\n{body_text}")


if __name__ == "__main__":
    main()
