import { Controller, Get } from '@nestjs/common';
import { JiraService } from './jira.service';

@Controller('jira')
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  @Get('tasks')
  async getTasks(): Promise<any> {
    return this.jiraService.getTasks();
  }
}
