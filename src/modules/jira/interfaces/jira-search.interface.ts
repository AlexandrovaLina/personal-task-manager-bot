export interface JiraIssueStatus {
  name: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
}

export interface JiraIssueFields {
  summary: string;
  status: JiraIssueStatus;
  customfield_10020?: JiraSprint[] | null;
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
