import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { extractError } from 'src/common/helpers';
import { JiraIssue, JiraSearchResponse } from './interfaces';

// Board this user's team now works off of instead of sprints (WA project's
// workflow moved to a Kanban board) — see JiraService.getBoardIssueExternalIds.
const CXL_BOARD_ID = 1395;

interface BoardIssuesResponse {
  issues: { id: string }[];
  total: number;
  startAt: number;
  maxResults: number;
}

@Injectable()
export class JiraService {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {
    this.logger = new Logger(JiraService.name);
  }

  private readonly baseUrl = this.configService.get<string>(`jira.baseUrl`);
  private readonly siteUrl = this.configService.get<string>(`jira.siteUrl`);
  private readonly authToken = this.configService.get<string>(`jira.authToken`);
  private readonly projectKey =
    this.configService.get<string>(`jira.projectKey`);

  private readonly maxResults = 100;
  private readonly maxPages = 20;

  /**
   * @param updatedWithinDays When set, only fetches issues updated within this
   * many days (a fast, partial view — the caller must not treat the result as
   * the full assigned set). Omit for the complete set of currently assigned
   * issues, regardless of when they were last touched.
   */
  public async getTasks(
    updatedWithinDays?: number,
  ): Promise<JiraSearchResponse> {
    try {
      const url = `${this.baseUrl}/search/jql`;
      const headers = {
        Authorization: `Basic ${this.authToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      const dateFilter = updatedWithinDays
        ? ` AND updated >= -${updatedWithinDays}d`
        : '';
      const jql = `project=${this.projectKey} AND assignee=currentUser()${dateFilter} ORDER BY updated DESC`;

      const issues: JiraIssue[] = [];
      let nextPageToken: string | undefined;
      let isLast = false;
      let pageCount = 0;

      while (!isLast && pageCount < this.maxPages) {
        const body = {
          jql,
          maxResults: this.maxResults,
          fields: ['summary', 'status', 'customfield_10020', 'parent'],
          ...(nextPageToken ? { nextPageToken } : {}),
        };

        const response = await firstValueFrom(
          this.httpService.post<JiraSearchResponse>(url, body, { headers }),
        );

        issues.push(...(response.data.issues ?? []));
        isLast = response.data.isLast ?? true;
        nextPageToken = response.data.nextPageToken;
        pageCount++;
      }

      if (!isLast) {
        const scope = updatedWithinDays
          ? `for the last ${updatedWithinDays} days`
          : 'for all currently assigned issues';
        this.logger.warn(
          `Jira search hit the ${this.maxPages}-page safety cap ` +
            `(${issues.length} issues fetched ${scope}) — result may still be truncated.`,
        );
      }

      return { issues };
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Error fetching tasks from Jira: ${message}`, stack);
      throw new Error('Could not fetch tasks from Jira');
    }
  }

  /**
   * External IDs of this user's currently-assigned issues that are also on
   * the CXL Kanban board — the WA project moved from sprints to this board,
   * so board membership is now the "is this actually current work" signal.
   */
  public async getBoardIssueExternalIds(): Promise<Set<string>> {
    try {
      const url = `${this.siteUrl}/rest/agile/1.0/board/${CXL_BOARD_ID}/issue`;
      const headers = {
        Authorization: `Basic ${this.authToken}`,
        Accept: 'application/json',
      };

      const externalIds = new Set<string>();
      let startAt = 0;
      let total = Infinity;
      let pageCount = 0;

      while (startAt < total && pageCount < this.maxPages) {
        const response = await firstValueFrom(
          this.httpService.get<BoardIssuesResponse>(url, {
            headers,
            params: {
              jql: 'assignee = currentUser()',
              fields: 'id',
              maxResults: this.maxResults,
              startAt,
            },
          }),
        );

        for (const issue of response.data.issues) externalIds.add(issue.id);
        total = response.data.total;
        startAt += response.data.issues.length || this.maxResults;
        pageCount++;
      }

      return externalIds;
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Error fetching CXL board issues from Jira: ${message}`,
        stack,
      );
      return new Set();
    }
  }

  public async getIssueByKey(key: string): Promise<JiraIssue> {
    try {
      const url = `${this.baseUrl}/issue/${key}?fields=summary`;
      const headers = {
        Authorization: `Basic ${this.authToken}`,
        Accept: 'application/json',
      };

      const response = await firstValueFrom(
        this.httpService.get<JiraIssue>(url, { headers }),
      );

      return response.data;
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Error fetching issue ${key} from Jira: ${message}`,
        stack,
      );
      throw new Error(`Could not fetch issue ${key} from Jira`);
    }
  }
}
