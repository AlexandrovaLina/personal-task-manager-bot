export const TASK_PAGE_SIZE = 5;

export enum TaskState {
  DEV_ANALYSIS = 'Dev Analysis',
  IN_PROGRESS = 'In Progress',
  AWAITING_CLIENT_FEEDBACK = 'Awaiting Client Feedback',
  BLOCKED = 'Blocked',
}

export enum ReportHeader {
  TITLE = '*-= Отчет по таскам=-*',
  CURRENT = '*‼️-=Текущие задачи=-‼️*',
  ADDITIONAL = '*-= Доп Инфа =-*',
  BLOCKED = '*-= Инфа по заблоченным таскам =-*',
}
