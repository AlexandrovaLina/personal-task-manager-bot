import {
  JiraTodoIssue,
  JiraTodoIssueFields,
} from '../interfaces/jira-priority.types';
import { rankTodoIssues } from './rank-todo-issues.helper';

const NOW = new Date(2026, 10, 12, 12, 0, 0);

const issue = (
  key: string,
  fields: Partial<JiraTodoIssueFields> = {},
): JiraTodoIssue => ({
  id: key,
  key,
  fields: {
    summary: key,
    priority: { name: 'Medium' },
    issuetype: { name: 'Task' },
    duedate: null,
    created: '2026-11-01T10:00:00.000-0500',
    ...fields,
  },
});

const keys = (issues: JiraTodoIssue[]) =>
  rankTodoIssues(issues, NOW).map((r) => r.issue.key);

describe('rankTodoIssues', () => {
  it('puts a due-soon issue above a higher-priority one', () => {
    expect(
      keys([
        issue('HIGHEST', { priority: { name: 'Highest' } }),
        issue('DUE', { priority: { name: 'Low' }, duedate: '2026-11-15' }),
      ]),
    ).toEqual(['DUE', 'HIGHEST']);
  });

  it('ignores a due date further than 7 days away', () => {
    expect(
      keys([
        issue('FAR', { priority: { name: 'Low' }, duedate: '2026-12-30' }),
        issue('HIGH', { priority: { name: 'High' } }),
      ]),
    ).toEqual(['HIGH', 'FAR']);
  });

  it('orders due-soon issues by due date and flags overdue ones', () => {
    const ranked = rankTodoIssues(
      [
        issue('LATER', { duedate: '2026-11-18' }),
        issue('OVERDUE', { duedate: '2026-11-10' }),
      ],
      NOW,
    );

    expect(ranked.map((r) => r.issue.key)).toEqual(['OVERDUE', 'LATER']);
    expect(ranked.map((r) => r.isOverdue)).toEqual([true, false]);
  });

  it('raises priority to the parent priority when it is higher', () => {
    const ranked = rankTodoIssues(
      [
        issue('PLAIN'),
        issue('CHILD', {
          parent: { key: 'P-1', fields: { priority: { name: 'High' } } },
        }),
      ],
      NOW,
    );

    expect(ranked[0].issue.key).toBe('CHILD');
    expect(ranked[0].effectivePriority).toBe('High');
    expect(ranked[0].parentRaisesPriority).toBe(true);
  });

  it('does not lower priority to a lower parent priority', () => {
    const [ranked] = rankTodoIssues(
      [
        issue('CHILD', {
          priority: { name: 'High' },
          parent: { key: 'P-1', fields: { priority: { name: 'Low' } } },
        }),
      ],
      NOW,
    );

    expect(ranked.effectivePriority).toBe('High');
    expect(ranked.parentRaisesPriority).toBe(false);
  });

  it('breaks ties by active sprint, then bug, then age', () => {
    const sprint = [{ name: 'S', state: 'active' }];

    expect(
      keys([
        issue('NEWER', { created: '2026-11-10T10:00:00.000-0500' }),
        issue('OLDER', { created: '2026-10-01T10:00:00.000-0400' }),
        issue('BUG', {
          issuetype: { name: 'Bug' },
          created: '2026-11-11T10:00:00.000-0500',
        }),
        issue('SPRINT', {
          customfield_10020: sprint,
          created: '2026-11-11T10:00:00.000-0500',
        }),
        issue('CLOSED_SPRINT', {
          customfield_10020: [{ name: 'Old', state: 'closed' }],
          created: '2026-11-12T10:00:00.000-0500',
        }),
      ]),
    ).toEqual(['SPRINT', 'BUG', 'OLDER', 'NEWER', 'CLOSED_SPRINT']);
  });
});
