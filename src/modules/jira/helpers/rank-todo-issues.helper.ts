import { JiraSprint, JiraTodoIssue } from '../interfaces/jira-priority.types';

export const DUE_SOON_DAYS = 7;

const PRIORITY_WEIGHT: Record<string, number> = {
  Highest: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Lowest: 1,
};

export interface RankedTodoIssue {
  issue: JiraTodoIssue;
  ownPriority: string | null;
  effectivePriority: string | null;
  parentRaisesPriority: boolean;
  activeSprint: JiraSprint | null;
  dueDate: string | null;
  isDueSoon: boolean;
  isOverdue: boolean;
  isBug: boolean;
}

const weight = (priority: string | null): number =>
  (priority && PRIORITY_WEIGHT[priority]) || 0;

const toIsoDate = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

export function rankTodoIssues(
  issues: JiraTodoIssue[],
  now: Date = new Date(),
): RankedTodoIssue[] {
  const today = toIsoDate(now);
  const soonLimit = new Date(now);
  soonLimit.setDate(soonLimit.getDate() + DUE_SOON_DAYS);
  const soon = toIsoDate(soonLimit);

  const ranked = issues.map((issue): RankedTodoIssue => {
    const { fields } = issue;
    const ownPriority = fields.priority?.name ?? null;
    const parentPriority = fields.parent?.fields?.priority?.name ?? null;
    const parentRaisesPriority = weight(parentPriority) > weight(ownPriority);
    const dueDate = fields.duedate ?? null;

    return {
      issue,
      ownPriority,
      effectivePriority: parentRaisesPriority ? parentPriority : ownPriority,
      parentRaisesPriority,
      activeSprint:
        fields.customfield_10020?.find((s) => s.state === 'active') ?? null,
      dueDate,
      isDueSoon: !!dueDate && dueDate <= soon,
      isOverdue: !!dueDate && dueDate < today,
      isBug: fields.issuetype?.name === 'Bug',
    };
  });

  return ranked.sort(
    (a, b) =>
      Number(b.isDueSoon) - Number(a.isDueSoon) ||
      (a.isDueSoon && b.isDueSoon ? a.dueDate.localeCompare(b.dueDate) : 0) ||
      weight(b.effectivePriority) - weight(a.effectivePriority) ||
      Number(!!b.activeSprint) - Number(!!a.activeSprint) ||
      Number(b.isBug) - Number(a.isBug) ||
      Date.parse(a.issue.fields.created) - Date.parse(b.issue.fields.created),
  );
}
