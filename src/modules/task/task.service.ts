import { TaskEntity } from './task.entity';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, InsertResult, UpdateResult } from 'typeorm';
import { CreateTaskDto } from './dto';
import { withTransaction } from 'src/common/helpers';
import { JiraService } from '../jira/jira.service';
import { TASK_PAGE_SIZE } from './constants';
import { taskTitleFormatter } from './helpers';

@Injectable()
export class TaskService {
  constructor(
    private readonly logger: Logger,
    private readonly datasource: DataSource,
    private readonly jiraService: JiraService,
  ) {
    this.logger = new Logger(TaskService.name);
  }

  public async create(args: CreateTaskDto): Promise<TaskEntity> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    const data = taskRepository.create(args);

    return data;
  }

  public async update(
    id: string,
    args: Partial<TaskEntity>,
  ): Promise<UpdateResult> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    const updateResult = await taskRepository.update(
      {
        id,
      },
      args,
    );

    return updateResult;
  }

  public async bulkUpsert(args: Partial<TaskEntity>[]): Promise<InsertResult> {
    const data = await withTransaction(this.datasource, async (queryRunner) => {
      const taskRepository = queryRunner.manager.getRepository(TaskEntity);
      const data = await taskRepository.upsert(args, {
        conflictPaths: ['externalId'],
        upsertType: 'on-conflict-do-update',
      });
      return data;
    });

    return data;
  }

  public async syncTaskData(): Promise<void> {
    const data = await this.jiraService.getTasks();
    const taskData: Partial<TaskEntity>[] = data.issues.map((el) => ({
      externalId: el.id,
      key: el.key,
      state: el.fields.status.name,
      number: +el.key.toString().replace('WA-', ''),
      title: el.fields.summary,
      url: `https://workaxle.atlassian.net/browse/${el.key}`,
    }));
    await this.bulkUpsert(taskData);
  }

  public async getTaskByKey(key: number): Promise<TaskEntity | null> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    const task = await taskRepository.findOneBy({ number: key });

    return task;
  }

  public async getTasks(page: number) {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    const [tasks, total] = await taskRepository.findAndCount({
      skip: (page - 1) * TASK_PAGE_SIZE,
      take: TASK_PAGE_SIZE,
      order: {
        number: 'DESC',
      },
    });

    return {
      tasks,
      total,
    };
  }

  public buildTaskReport(task: TaskEntity): string {
    const report = `Таска [WA-${task.number}: ${taskTitleFormatter(task.title)}](${task.url})\nСтатус - ${task.state} \nКомментарии - ${task.comments || 'Отсутствуют'}`;
    return report;
  }
}
