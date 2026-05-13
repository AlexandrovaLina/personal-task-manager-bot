import { Controller, Get } from '@nestjs/common';
import { JiraService } from './jira.service';
import { JiraSearchResponse } from './interfaces';

@Controller('jira')
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  @Get('tasks')
  async getTasks(): Promise<JiraSearchResponse> {
    return this.jiraService.getTasks();
  }
}
