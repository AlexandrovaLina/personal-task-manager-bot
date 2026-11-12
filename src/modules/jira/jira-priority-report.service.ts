import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { escapeHtml, extractError } from 'src/common/helpers';
import { JiraSprint, JiraTodoIssue } from './interfaces';
import {
  DUE_SOON_DAYS,
  RankedTodoIssue,
  rankTodoIssues,
} from './helpers/rank-todo-issues.helper';

const TODO_JQL = 'assignee = currentUser() AND status = "To Do"';
const TODO_FIELDS = [
  'summary',
  'priority',
  'issuetype',
  'duedate',
  'created',
  'parent',
  'customfield_10020',
];

interface TodoSearchResponse {
  issues: JiraTodoIssue[];
}

@Injectable()
export class JiraPriorityReportService {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {
    this.logger = new Logger(JiraPriorityReportService.name);
  }

  private readonly baseUrl = this.configService.get<string>('jira.baseUrl');
  private readonly siteUrl = this.configService.get<string>('jira.siteUrl');
  private readonly authToken = this.configService.get<string>('jira.authToken');

  public async generatePriorityReport(): Promise<string> {
    try {
      const issues = await this.searchTodo();
      return this.formatReport(rankTodoIssues(issues));
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to generate priority report: ${message}`,
        stack,
      );
      throw new Error('Could not generate priority report from Jira');
    }
  }

  private async searchTodo(): Promise<JiraTodoIssue[]> {
    const response = await firstValueFrom(
      this.httpService.post<TodoSearchResponse>(
        `${this.baseUrl}/search/jql`,
        { jql: TODO_JQL, maxResults: 100, fields: TODO_FIELDS },
        {
          headers: {
            Authorization: `Basic ${this.authToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return response.data.issues ?? [];
  }

  private formatReport(ranked: RankedTodoIssue[]): string {
    if (!ranked.length) return 'Нет задач в статусе To Do.';

    const header = [`<b>🎯 Приоритет To Do (${ranked.length})</b>`];

    for (const sprint of this.distinctSprints(ranked)) {
      const end = sprint.endDate
        ? `, до ${this.formatDate(sprint.endDate)}`
        : '';
      header.push(`🏃 Спринт <b>${escapeHtml(sprint.name)}</b>${end}`);
      if (sprint.goal?.trim()) {
        header.push(`Цель:\n${escapeHtml(sprint.goal.trim())}`);
      }
    }

    if (!ranked.some((r) => r.dueDate)) {
      header.push('📅 Дедлайнов нет ни у одной задачи');
    }

    const lines = ranked.map((r, idx) => this.formatIssue(r, idx + 1));

    const legend =
      `<i>Порядок: дедлайн в ближайшие ${DUE_SOON_DAYS} дней → ` +
      'приоритет (наибольший из задачи и родителя) → активный спринт → ' +
      'баг → более старая</i>';

    return [header.join('\n'), ...lines, legend].join('\n\n');
  }

  private formatIssue(ranked: RankedTodoIssue, index: number): string {
    const { issue } = ranked;
    const { fields } = issue;
    const link = `<a href="${this.siteUrl}/browse/${issue.key}">${issue.key}</a>`;

    const tags = [`⚡ ${escapeHtml(ranked.ownPriority ?? '—')}`];
    if (ranked.parentRaisesPriority) {
      tags.push(
        `📌 родитель ${fields.parent.key} — ${escapeHtml(ranked.effectivePriority)}`,
      );
    }
    if (ranked.dueDate) {
      const due = `📅 до ${this.formatDate(ranked.dueDate)}`;
      tags.push(ranked.isOverdue ? `${due} ⚠️ просрочена` : due);
    }
    if (ranked.activeSprint) tags.push('🏃 в спринте');
    if (ranked.isBug) tags.push('🐞 баг');

    return [
      `${index}. ${link} — ${escapeHtml(fields.summary)}`,
      `   ${tags.join(' · ')}`,
    ].join('\n');
  }

  private distinctSprints(ranked: RankedTodoIssue[]): JiraSprint[] {
    const byName = new Map<string, JiraSprint>();
    for (const { activeSprint } of ranked) {
      if (activeSprint) byName.set(activeSprint.name, activeSprint);
    }
    return [...byName.values()];
  }

  private formatDate(isoDate: string): string {
    const [, month, day] = isoDate.slice(0, 10).split('-');
    return `${day}.${month}`;
  }
}
