import { Logger, Module } from '@nestjs/common';
import { JiraService } from './jira.service';
import { JiraActivityReportService } from './jira-activity-report.service';
import { JiraPriorityReportService } from './jira-priority-report.service';
import { HttpModule } from '@nestjs/axios';
import { JiraController } from './jira.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [
    JiraService,
    JiraActivityReportService,
    JiraPriorityReportService,
    Logger,
  ],
  controllers: [JiraController],
  exports: [JiraService, JiraActivityReportService, JiraPriorityReportService],
})
export class JiraModule {}
