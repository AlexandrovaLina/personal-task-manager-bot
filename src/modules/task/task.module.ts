import { Logger, Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskEntity } from './task.entity';
import { JiraModule } from '../jira/jira.module';

@Module({
  imports: [TypeOrmModule.forFeature([TaskEntity]), JiraModule],
  providers: [Logger, TaskService],
  exports: [TaskService],
})
export class TaskModule {}
