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
import { JiraService } from '../jira/jira.service';
import { JiraIssue } from '../jira/interfaces';
import { ManualEntryService } from '../manual-entry/manual-entry.service';
import { ManualEntryEntity } from '../manual-entry/manual-entry.entity';
import {
  TaskState,
  ReportHeader,
  HIDEABLE_STATES,
  SUBTASK_REVIEW_STATE,
} from './constants';
import { escapeHtml } from '../telegram-bot/helpers';

interface ReportItem {
  text: string;
  children?: string[];
}

@Injectable()
export class TaskService {
  constructor(
    private readonly logger: Logger,
    private readonly datasource: DataSource,
    private readonly jiraService: JiraService,
    private readonly manualEntryService: ManualEntryService,
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

  public buildTaskReport(task: TaskEntity): string {
    const comments = task.comments || 'Отсутствуют';
    const title = escapeHtml(task.title);
    const report = `Таска <a href="${task.url}">WA-${task.number}: ${title}</a>\nСтатус - ${task.state}\nКомментарии - ${comments}`;
    return report;
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

  public buildManualEntryReport(entry: ManualEntryEntity): string {
    const title = escapeHtml(entry.title);
    return `<a href="${entry.url}">${entry.key}: ${title}</a>\nКомментарии - ${entry.comment}`;
  }

  public buildDelegatedParentReport(task: TaskEntity): string {
    const title = escapeHtml(task.title);
    return (
      `⏳ Таска <a href="${task.url}">WA-${task.number}: ${title}</a>\n` +
      `Статус - ${task.state}\n` +
      `Ожидает ревью подзадачи:`
    );
  }

  public buildParentWithChildrenReport(task: TaskEntity): string {
    const title = escapeHtml(task.title);
    return (
      `Таска <a href="${task.url}">WA-${task.number}: ${title}</a>\n` +
      `Статус - ${task.state}\n` +
      `Это родительская таска для:`
    );
  }

  public buildChildTaskReport(task: TaskEntity): string {
    return `↳ ${this.buildTaskReport(task)}`;
  }

  private buildSection(
    items: ReportItem[],
    counter: { value: number },
    header?: ReportHeader,
  ): string | null {
    if (!items.length) return null;

    const rendered = items.map((item) => {
      const numbered = `${counter.value++}. ${item.text}`;
      return item.children?.length
        ? [numbered, ...item.children].join('\n')
        : numbered;
    });

    const body = rendered.join('\n\n');
    return header ? `${header}\n\n${body}` : body;
  }

  public async generateAutoReport(
    currentSprintOnly = false,
  ): Promise<string | null> {
    let dirtyTasks: TaskEntity[],
      devAnalysisTasks: TaskEntity[],
      inProgressTasks: TaskEntity[],
      awaitingTasks: TaskEntity[],
      blockedTasks: TaskEntity[],
      manualEntries: ManualEntryEntity[];

    try {
      [
        dirtyTasks,
        devAnalysisTasks,
        inProgressTasks,
        awaitingTasks,
        blockedTasks,
        manualEntries,
      ] = await Promise.all([
        this.getDirtyTasks(),
        this.getTasksByState(TaskState.DEV_ANALYSIS),
        this.getTasksByState(TaskState.IN_PROGRESS),
        this.getTasksByState(
          TaskState.AWAITING_CLIENT_FEEDBACK,
          currentSprintOnly,
        ),
        this.getTasksByState(TaskState.BLOCKED, currentSprintOnly),
        this.manualEntryService.getAllEntries(),
      ]);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to fetch tasks for auto report: ${message}`,
        stack,
      );
      throw error;
    }

    const currentTaskCandidates = [...devAnalysisTasks, ...inProgressTasks];

    const childrenByParent = new Map<string, TaskEntity[]>();
    if (currentTaskCandidates.length) {
      const taskRepository = this.datasource.getRepository(TaskEntity);
      const children = await taskRepository.find({
        where: {
          parentExternalId: In(currentTaskCandidates.map((t) => t.externalId)),
          deletedAt: IsNull(),
        },
      });

      for (const child of children) {
        const siblings = childrenByParent.get(child.parentExternalId) ?? [];
        siblings.push(child);
        childrenByParent.set(child.parentExternalId, siblings);
      }
    }

    const hasReviewChild = (externalId: string): boolean =>
      (childrenByParent.get(externalId) ?? []).some(
        (child) => child.state === SUBTASK_REVIEW_STATE,
      );

    const plainCurrentTasks = currentTaskCandidates.filter(
      (t) => !childrenByParent.has(t.externalId),
    );
    const delegatedParents = currentTaskCandidates.filter((t) =>
      hasReviewChild(t.externalId),
    );
    const parentsWithChildren = currentTaskCandidates.filter(
      (t) =>
        childrenByParent.has(t.externalId) && !hasReviewChild(t.externalId),
    );
    const nestedChildIds = new Set(
      [...childrenByParent.values()].flat().map((t) => t.id),
    );

    const visibleAwaitingTasks = awaitingTasks.filter((t) => !t.isHidden);
    const visibleBlockedTasks = blockedTasks.filter((t) => !t.isHidden);

    const sectionIds = new Set(
      [
        ...plainCurrentTasks,
        ...parentsWithChildren,
        ...awaitingTasks,
        ...blockedTasks,
      ].map((t) => t.id),
    );
    const delegatedParentIds = new Set(delegatedParents.map((t) => t.id));
    const mainTasks = dirtyTasks.filter(
      (t) =>
        !sectionIds.has(t.id) &&
        !delegatedParentIds.has(t.id) &&
        !nestedChildIds.has(t.id),
    );

    const currentManualEntries = manualEntries.filter((e) => e.isCurrent);
    const mainManualEntries = manualEntries.filter((e) => !e.isCurrent);

    const mainItems: ReportItem[] = [
      ...mainManualEntries.map((entry) => ({
        text: this.buildManualEntryReport(entry),
      })),
      ...delegatedParents.map((task) => ({
        text: this.buildDelegatedParentReport(task),
        children: (childrenByParent.get(task.externalId) ?? []).map((child) =>
          this.buildChildTaskReport(child),
        ),
      })),
      ...mainTasks.map((task) => ({ text: this.buildTaskReport(task) })),
    ];

    const currentItems: ReportItem[] = [
      ...currentManualEntries.map((entry) => ({
        text: this.buildManualEntryReport(entry),
      })),
      ...parentsWithChildren.map((task) => ({
        text: this.buildParentWithChildrenReport(task),
        children: (childrenByParent.get(task.externalId) ?? []).map((child) =>
          this.buildChildTaskReport(child),
        ),
      })),
      ...plainCurrentTasks.map((task) => ({
        text: this.buildTaskReport(task),
      })),
    ];

    const counter = { value: 1 };
    const sections = [
      this.buildSection(mainItems, counter),
      this.buildSection(currentItems, counter, ReportHeader.CURRENT),
      this.buildSection(
        visibleAwaitingTasks.map((task) => ({
          text: this.buildTaskReport(task),
        })),
        counter,
        ReportHeader.ADDITIONAL,
      ),
      this.buildSection(
        visibleBlockedTasks.map((task) => ({
          text: this.buildTaskReport(task),
        })),
        counter,
        ReportHeader.BLOCKED,
      ),
    ].filter(Boolean);

    if (!sections.length) return null;

    return [ReportHeader.TITLE, ...sections].join('\n\n');
  }
}
