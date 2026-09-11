import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { extractError } from 'src/common/helpers';
import {
  JiraActivityIssue,
  JiraAdfNode,
  JiraDevStatusResponse,
  JiraIssueDetail,
  JiraPullRequest,
} from './interfaces';

interface ActivitySearchResponse {
  issues: JiraActivityIssue[];
}

const ISSUE_FIELDS = ['summary', 'status', 'priority', 'id'];
const COMMENT_MAX_LENGTH = 300;

interface UpdatedRow {
  issue: JiraActivityIssue;
  comments: string[];
}

@Injectable()
export class JiraActivityReportService {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {
    this.logger = new Logger(JiraActivityReportService.name);
  }

  private readonly baseUrl = this.configService.get<string>('jira.baseUrl');
  private readonly siteUrl = this.configService.get<string>('jira.siteUrl');
  private readonly authToken = this.configService.get<string>('jira.authToken');
  private readonly userAccountId =
    this.configService.get<string>('jira.userAccountId');

  private get headers() {
    return {
      Authorization: `Basic ${this.authToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  public async generateRecentActivityReport(): Promise<string> {
    try {
      const hours = new Date().getDay() === 1 ? 72 : 24;
      const sinceMs = Date.now() - hours * 60 * 60 * 1000;
      const label =
        hours === 72 ? 'пятница–воскресенье (72ч)' : 'последние 24ч';

      const [created, candidates, rtm] = await Promise.all([
        this.search(
          `assignee = currentUser() AND created >= -${hours}h ORDER BY created DESC`,
        ),
        this.search(
          `assignee = currentUser() AND updated >= -${hours}h AND created < -${hours}h ORDER BY updated DESC`,
        ),
        this.search(
          `assignee = currentUser() AND status = "Ready to Merge" ORDER BY updated DESC`,
        ),
      ]);

      const earlyPrIds = [...new Set([...created, ...rtm].map((i) => i.id))];
      const [earlyPrEntries, issueDetailEntries] = await Promise.all([
        Promise.all(
          earlyPrIds.map(async (id) => [id, await this.getPrs(id)] as const),
        ),
        Promise.all(
          candidates.map(
            async (issue) =>
              [issue.key, await this.getIssueDetail(issue.key)] as const,
          ),
        ),
      ]);

      const prsMap = new Map<string, JiraPullRequest[]>(earlyPrEntries);
      const issueDetailByKey = new Map(issueDetailEntries);

      const updatedRows: UpdatedRow[] = [];
      const reassigned: JiraActivityIssue[] = [];

      for (const issue of candidates) {
        const detail = issueDetailByKey.get(issue.key);
        const { changed, wasReassigned, comments } = this.inspectIssueDetail(
          detail,
          sinceMs,
        );

        if (wasReassigned) {
          reassigned.push(issue);
        } else if (changed) {
          updatedRows.push({ issue, comments });
        }
      }

      const allCreated = [...created, ...reassigned];

      const updatedIds = [
        ...new Set(
          updatedRows
            .map((row) => row.issue.id)
            .filter((id) => !prsMap.has(id)),
        ),
      ];
      if (updatedIds.length) {
        const entries = await Promise.all(
          updatedIds.map(async (id) => [id, await this.getPrs(id)] as const),
        );
        for (const [id, prs] of entries) prsMap.set(id, prs);
      }

      return this.formatReport({
        hours,
        label,
        allCreated,
        updatedRows,
        rtm,
        prsMap,
      });
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to generate recent activity report: ${message}`,
        stack,
      );
      throw new Error('Could not generate recent activity report from Jira');
    }
  }

  private inspectIssueDetail(
    detail: JiraIssueDetail | undefined,
    sinceMs: number,
  ): { changed: boolean; wasReassigned: boolean; comments: string[] } {
    let changed = false;
    let wasReassigned = false;
    const comments: string[] = [];

    for (const history of detail?.changelog?.histories ?? []) {
      if (new Date(history.created).getTime() < sinceMs) continue;

      for (const item of history.items) {
        if (item.field === 'status') {
          changed = true;
        } else if (
          item.field === 'assignee' &&
          this.userAccountId &&
          item.to === this.userAccountId
        ) {
          wasReassigned = true;
        }
      }
    }

    for (const comment of detail?.fields?.comment?.comments ?? []) {
      if (new Date(comment.created).getTime() < sinceMs) continue;

      changed = true;
      const author = comment.author?.displayName ?? '';
      const fullText = this.extractText(comment.body);
      const text =
        fullText.length > COMMENT_MAX_LENGTH
          ? `${fullText.slice(0, COMMENT_MAX_LENGTH)}…✂️`
          : fullText;
      comments.push(`${text} (${author})`);
    }

    return { changed, wasReassigned, comments };
  }

  private extractText(node: JiraAdfNode | undefined): string {
    if (!node) return '';
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'mention') return node.attrs?.text ?? '';
    return (node.content ?? [])
      .map((child) => this.extractText(child))
      .join(' ');
  }

  private async search(jql: string): Promise<JiraActivityIssue[]> {
    const url = `${this.baseUrl}/search/jql`;
    const body = { jql, maxResults: 50, fields: ISSUE_FIELDS };

    const response = await firstValueFrom(
      this.httpService.post<ActivitySearchResponse>(url, body, {
        headers: this.headers,
      }),
    );

    return response.data.issues ?? [];
  }

  private async getIssueDetail(key: string): Promise<JiraIssueDetail> {
    const url = `${this.baseUrl}/issue/${key}?expand=changelog&fields=comment`;

    const response = await firstValueFrom(
      this.httpService.get<JiraIssueDetail>(url, { headers: this.headers }),
    );

    return response.data;
  }

  private async getPrs(issueId: string): Promise<JiraPullRequest[]> {
    try {
      const url = `${this.siteUrl}/rest/dev-status/1.0/issue/detail?issueId=${issueId}&applicationType=GitHub&dataType=pullrequest`;

      const response = await firstValueFrom(
        this.httpService.get<JiraDevStatusResponse>(url, {
          headers: this.headers,
        }),
      );

      return response.data.detail?.[0]?.pullRequests ?? [];
    } catch (error: unknown) {
      const { message } = extractError(error);
      this.logger.warn(`Failed to fetch PRs for issue ${issueId}: ${message}`);
      return [];
    }
  }

  private formatPrs(prs: JiraPullRequest[]): string {
    if (!prs.length) return '';
    return prs
      .map((pr) => `[${pr.status.toUpperCase()}](${pr.url})`)
      .join(', ');
  }

  private issueUrl(key: string): string {
    return `https://workaxle.atlassian.net/browse/${key}`;
  }

  private formatIssueLine(
    issue: JiraActivityIssue,
    index: number,
    prsMap: Map<string, JiraPullRequest[]>,
    options: { withStatus: boolean },
  ): string {
    const { key, fields } = issue;
    const prs = this.formatPrs(prsMap.get(issue.id) ?? []);

    const lines = [
      `${index}. [${key}](${this.issueUrl(key)}) — ${fields.summary}`,
    ];
    lines.push(
      options.withStatus
        ? `   📊 ${fields.status.name} | ⚡ ${fields.priority.name}`
        : `   ⚡ ${fields.priority.name}`,
    );
    if (prs) lines.push(`   🔗 PR: ${prs}`);

    return lines.join('\n');
  }

  private formatReport(args: {
    hours: number;
    label: string;
    allCreated: JiraActivityIssue[];
    updatedRows: UpdatedRow[];
    rtm: JiraActivityIssue[];
    prsMap: Map<string, JiraPullRequest[]>;
  }): string {
    const { hours, label, allCreated, updatedRows, rtm, prsMap } = args;

    const createdSection = allCreated.length
      ? allCreated
          .map((issue, idx) =>
            this.formatIssueLine(issue, idx + 1, prsMap, { withStatus: true }),
          )
          .join('\n\n')
      : 'Нет новых задач.';

    const updatedSection = updatedRows.length
      ? updatedRows
          .map((row, idx) => {
            const base = this.formatIssueLine(row.issue, idx + 1, prsMap, {
              withStatus: true,
            });
            const comments = row.comments.map((c) => `   💬 ${c}`).join('\n');
            return comments ? `${base}\n${comments}` : base;
          })
          .join('\n\n')
      : 'Нет обновлённых задач.';

    const rtmSection = rtm.length
      ? rtm
          .map((issue, idx) =>
            this.formatIssueLine(issue, idx + 1, prsMap, { withStatus: false }),
          )
          .join('\n\n')
      : 'Нет задач в статусе Ready to Merge.';

    return [
      `*Jira — обновления за последние ${hours} часов*`,
      `*За период:* ${label}`,
      `*Созданные задачи (${allCreated.length})*\n\n${createdSection}`,
      `*Обновлённые задачи (${updatedRows.length})*\n\n${updatedSection}`,
      `*Ready to Merge (${rtm.length})*\n\n${rtmSection}`,
    ].join('\n\n');
  }
}
