import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { extractError } from 'src/common/helpers';
import { JiraIssue, JiraSearchResponse } from './interfaces';

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
