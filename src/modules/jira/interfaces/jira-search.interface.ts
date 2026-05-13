export interface JiraIssueStatus {
  name: string;
}

export interface JiraIssueFields {
  summary: string;
  status: JiraIssueStatus;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResponse {
  total: number;
  maxResults: number;
  startAt: number;
  issues: JiraIssue[];
}
