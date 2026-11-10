export interface JiraIssueStatus {
  name: string;
}

export interface JiraIssueParent {
  id: string;
  key: string;
}

export interface JiraIssueFields {
  summary: string;
  status: JiraIssueStatus;
  parent?: JiraIssueParent | null;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}
