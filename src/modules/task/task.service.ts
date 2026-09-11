import { TaskEntity } from './task.entity';
import { Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  InsertResult,
  IsNull,
  Not,
  In,
  UpdateResult,
} from 'typeorm';
import { withTransaction, extractError } from 'src/common/helpers';
import { JiraService, JiraIssue } from '../jira';
import { HIDEABLE_STATES } from './constants';

@Injectable()
export class TaskService {
  constructor(
    private readonly logger: Logger,
    private readonly datasource: DataSource,
    private readonly jiraService: JiraService,
  ) {
    this.logger = new Logger(TaskService.name);
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
    try {
      const data = await withTransaction(
        this.datasource,
        async (queryRunner) => {
          const taskRepository = queryRunner.manager.getRepository(TaskEntity);
          const data = await taskRepository.upsert(args, {
            conflictPaths: ['externalId'],
            upsertType: 'on-conflict-do-update',
          });
          return data;
        },
      );

      return data;
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to bulk upsert ${args.length} tasks: ${message}`,
        stack,
      );
      throw error;
    }
  }

  public async syncTaskData(): Promise<void> {
    try {
      const data = await this.jiraService.getTasks();

      if (!data?.issues) {
        this.logger.error('Jira returned invalid response: missing issues');
        throw new Error('Invalid Jira response');
      }

      const taskRepository = this.datasource.getRepository(TaskEntity);

      const activeExternalIds = data.issues.map((issue: JiraIssue) => issue.id);
      const existingTasks = activeExternalIds.length
        ? await taskRepository.find({
            where: { externalId: In(activeExternalIds) },
            withDeleted: true,
          })
        : [];
      const existingByExternalId = new Map(
        existingTasks.map((task) => [task.externalId, task]),
      );

      const taskData: Partial<TaskEntity>[] = data.issues.map(
        (issue: JiraIssue) => {
          const state = issue.fields.status.name;

          return {
            externalId: issue.id,
            state,
            number: +issue.key.replace('WA-', ''),
            title: issue.fields.summary,
            url: `https://workaxle.atlassian.net/browse/${issue.key}`,
            isCurrentSprint:
              issue.fields.customfield_10020?.some(
                (sprint) => sprint.state === 'active',
              ) ?? false,
            parentExternalId: issue.fields.parent?.id ?? null,
            deletedAt: null,
            isHidden: this.resolveIsHidden(
              state,
              existingByExternalId.get(issue.id),
            ),
          };
        },
      );
      await this.bulkUpsert(taskData);

      if (activeExternalIds.length) {
        await taskRepository.softDelete({
          externalId: Not(In(activeExternalIds)),
          deletedAt: IsNull(),
        });
      }

      this.logger.log(`Synced ${taskData.length} tasks from Jira`);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to sync tasks: ${message}`, stack);
      throw error;
    }
  }

  public async getTaskByKey(key: number): Promise<TaskEntity | null> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    const task = await taskRepository.findOneBy({ number: key });

    return task;
  }

  public async getDirtyTasks(currentSprintOnly = false): Promise<TaskEntity[]> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    return taskRepository.find({
      where: {
        isCommentDirty: true,
        deletedAt: IsNull(),
        ...(currentSprintOnly ? { isCurrentSprint: true } : {}),
      },
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

  public async getTasksByState(
    state: string,
    currentSprintOnly = false,
  ): Promise<TaskEntity[]> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    return taskRepository.find({
      where: {
        state,
        deletedAt: IsNull(),
        ...(currentSprintOnly ? { isCurrentSprint: true } : {}),
      },
      order: { number: 'DESC' },
    });
  }

  public async getChildrenByParentIds(
    parentExternalIds: string[],
  ): Promise<TaskEntity[]> {
    if (!parentExternalIds.length) return [];

    const taskRepository = this.datasource.getRepository(TaskEntity);

    return taskRepository.find({
      where: { parentExternalId: In(parentExternalIds), deletedAt: IsNull() },
    });
  }

  public async getHideableTasks(): Promise<TaskEntity[]> {
    const taskRepository = this.datasource.getRepository(TaskEntity);

    return taskRepository.find({
      where: { state: In([...HIDEABLE_STATES]), deletedAt: IsNull() },
      order: { number: 'DESC' },
    });
  }

  public async setTaskHidden(
    id: string,
    isHidden: boolean,
  ): Promise<UpdateResult> {
    return this.update(id, { isHidden });
  }

  private resolveIsHidden(state: string, existing?: TaskEntity): boolean {
    if (!HIDEABLE_STATES.includes(state)) return false;

    if (existing && HIDEABLE_STATES.includes(existing.state)) {
      return existing.isHidden;
    }

    return false;
  }
}
