import { TaskEntity } from './task.entity';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, InsertResult, IsNull, UpdateResult } from 'typeorm';
import { CreateTaskDto } from './dto';
import { withTransaction } from 'src/common/helpers';
import { JiraService } from '../jira/jira.service';
import { TASK_PAGE_SIZE, TaskState, ReportHeader } from './constants';
import { escapeHtml } from '../telegram-bot/helpers';

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
    const comments = task.comments || 'Отсутствуют';
    const title = escapeHtml(task.title);
    const report = `Таска <a href="${task.url}">WA-${task.number}: ${title}</a>\nСтатус - ${task.state}\nКомментарии - ${comments}`;
    return report;
  }

  public async getDirtyTasks(): Promise<TaskEntity[]> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    return taskRepository.find({
      where: { isCommentDirty: true, deletedAt: IsNull() },
      order: { number: 'DESC' },
    });
  }

  public async resetDirtyFlags(): Promise<void> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    await taskRepository.update(
      { isCommentDirty: true },
      { isCommentDirty: false },
    );
  }

  public async getTasksByState(state: string): Promise<TaskEntity[]> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    return taskRepository.find({
      where: { state, deletedAt: IsNull() },
      order: { number: 'DESC' },
    });
  }

  private buildSection(
    tasks: TaskEntity[],
    counter: { value: number },
    header?: ReportHeader,
  ): string | null {
    if (!tasks.length) return null;

    const lines = tasks
      .map((task) => `${counter.value++}. ${this.buildTaskReport(task)}`)
      .join('\n\n');

    return header ? `${header}\n\n${lines}` : lines;
  }

  public async generateAutoReport(): Promise<string | null> {
    const [
      dirtyTasks,
      devAnalysisTasks,
      inProgressTasks,
      awaitingTasks,
      blockedTasks,
    ] = await Promise.all([
      this.getDirtyTasks(),
      this.getTasksByState(TaskState.DEV_ANALYSIS),
      this.getTasksByState(TaskState.IN_PROGRESS),
      this.getTasksByState(TaskState.AWAITING_CLIENT_FEEDBACK),
      this.getTasksByState(TaskState.BLOCKED),
    ]);

    const currentTasks = [...devAnalysisTasks, ...inProgressTasks];
    const sectionIds = new Set(
      [...currentTasks, ...awaitingTasks, ...blockedTasks].map((t) => t.id),
    );
    const mainTasks = dirtyTasks.filter((t) => !sectionIds.has(t.id));

    const counter = { value: 1 };
    const sections = [
      this.buildSection(mainTasks, counter),
      this.buildSection(currentTasks, counter, ReportHeader.CURRENT),
      this.buildSection(awaitingTasks, counter, ReportHeader.ADDITIONAL),
      this.buildSection(blockedTasks, counter, ReportHeader.BLOCKED),
    ].filter(Boolean);

    if (!sections.length) return null;

    return [ReportHeader.TITLE, ...sections].join('\n\n');
  }
}
