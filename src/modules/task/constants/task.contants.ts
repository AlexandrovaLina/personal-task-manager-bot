export const TASK_PAGE_SIZE = 5;

export enum TaskState {
  DEV_ANALYSIS = 'Dev Analysis',
  IN_PROGRESS = 'In Progress',
  AWAITING_CLIENT_FEEDBACK = 'Awaiting Client Feedback',
  BLOCKED = 'Blocked',
}

export enum ReportHeader {
  TITLE = '<b>-= Отчет по таскам=-</b>',
  CURRENT = '<b>‼️-=Текущие задачи=-‼️</b>',
  ADDITIONAL = '<b>-= Доп Инфа =-</b>',
  BLOCKED = '<b>-= Инфа по заблоченным таскам =-</b>',
}

export const HIDEABLE_STATES: readonly string[] = [
  TaskState.AWAITING_CLIENT_FEEDBACK,
  TaskState.BLOCKED,
];
