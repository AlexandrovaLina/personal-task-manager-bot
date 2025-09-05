import { Logger, Module } from '@nestjs/common';
import { JiraService } from './jira.service';
import { HttpModule } from '@nestjs/axios';
import { JiraController } from './jira.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [JiraService, Logger],
  controllers: [JiraController],
  exports: [JiraService],
})
export class JiraModule {}
