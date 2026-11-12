export interface JiraSprint {
  name: string;
  state: string;
  goal?: string;
  endDate?: string;
}

export interface JiraTodoIssueParent {
  key: string;
  fields?: {
    summary?: string;
    priority?: { name: string } | null;
  };
}

export interface JiraTodoIssueFields {
  summary: string;
  priority?: { name: string } | null;
  issuetype: { name: string };
  duedate?: string | null;
  created: string;
  parent?: JiraTodoIssueParent | null;
  customfield_10020?: JiraSprint[] | null;
}

export interface JiraTodoIssue {
  id: string;
  key: string;
  fields: JiraTodoIssueFields;
}
