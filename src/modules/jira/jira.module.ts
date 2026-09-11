import { Logger, Module } from '@nestjs/common';
import { JiraService } from './jira.service';
import { JiraActivityReportService } from './jira-activity-report.service';
import { HttpModule } from '@nestjs/axios';
import { JiraController } from './jira.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [JiraService, JiraActivityReportService, Logger],
  controllers: [JiraController],
  exports: [JiraService, JiraActivityReportService],
})
export class JiraModule {}
