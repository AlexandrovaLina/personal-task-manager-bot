import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { extractError } from 'src/common/helpers';
import { JiraSearchResponse } from './interfaces';

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
  private readonly updatedWindowDays = 90;

  public async getTasks(): Promise<JiraSearchResponse> {
    try {
      const url = `${this.baseUrl}/search/jql`;
      const headers = {
        Authorization: `Basic ${this.authToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      const body = {
        jql: `project=${this.projectKey} AND assignee=currentUser() AND updated >= -${this.updatedWindowDays}d ORDER BY updated DESC`,
        maxResults: this.maxResults,
        fields: ['summary', 'status'],
      };

      const response = await firstValueFrom(
        this.httpService.post<JiraSearchResponse>(url, body, { headers }),
      );

      if (response.data?.issues?.length === this.maxResults) {
        this.logger.warn(
          `Jira returned ${this.maxResults} issues (page limit) for the last ` +
            `${this.updatedWindowDays} days — result may be truncated and ` +
            `tasks outside the page risk being soft-deleted. Consider pagination.`,
        );
      }

      return response.data;
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Error fetching tasks from Jira: ${message}`, stack);
      throw new Error('Could not fetch tasks from Jira');
    }
  }
}
