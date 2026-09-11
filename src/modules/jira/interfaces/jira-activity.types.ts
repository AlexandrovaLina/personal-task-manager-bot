export interface JiraActivityIssueFields {
  summary: string;
  status: { name: string };
  priority: { name: string };
}

export interface JiraActivityIssue {
  id: string;
  key: string;
  fields: JiraActivityIssueFields;
}

export interface JiraAdfNode {
  type?: string;
  text?: string;
  attrs?: { text?: string };
  content?: JiraAdfNode[];
}

export interface JiraChangelogItem {
  field: string;
  to?: string;
}

export interface JiraChangelogHistory {
  created: string;
  items: JiraChangelogItem[];
}

export interface JiraComment {
  created: string;
  author?: { displayName: string };
  body?: JiraAdfNode;
}

export interface JiraIssueDetail {
  changelog?: { histories: JiraChangelogHistory[] };
  fields: {
    comment?: { comments: JiraComment[] };
  };
}

export interface JiraPullRequest {
  url: string;
  status: string;
}

export interface JiraDevStatusResponse {
  detail?: Array<{ pullRequests?: JiraPullRequest[] }>;
}
