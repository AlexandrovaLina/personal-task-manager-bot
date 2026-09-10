export interface JiraIssueStatus {
  name: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
}

export interface JiraIssueParent {
  id: string;
  key: string;
}

export interface JiraIssueFields {
  summary: string;
  status: JiraIssueStatus;
  customfield_10020?: JiraSprint[] | null;
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
