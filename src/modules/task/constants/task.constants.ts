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
