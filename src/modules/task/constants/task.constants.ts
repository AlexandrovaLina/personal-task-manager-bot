export enum TaskState {
  IN_PROGRESS = 'In Progress',
  AWAITING_CLIENT_FEEDBACK = 'Awaiting Client Feedback',
  BLOCKED = 'Blocked',
  UNDER_REVIEW = 'UNDER REVIEW',
}

export const HIDEABLE_STATES: readonly string[] = [
  TaskState.AWAITING_CLIENT_FEEDBACK,
  TaskState.BLOCKED,
];

// Jira project WA's "Done" status-category members (confirmed against the
// live workflow) — used to tell "this subtask is actually finished" apart
// from every other in-progress-ish status.
export const DONE_STATES: readonly string[] = [
  'Done',
  'Completed',
  'Released',
  'Canceled',
];
