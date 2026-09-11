import { Injectable, Logger } from '@nestjs/common';
import { escapeHtml, extractError } from 'src/common/helpers';
import { TaskService, TaskEntity, TaskState } from '../task';
import { ManualEntryService, ManualEntryEntity } from '../manual-entry';
import { ReportHeader } from './constants';

interface ReportItem {
  text: string;
  children?: string[];
}

@Injectable()
export class ReportBuilderService {
  constructor(
    private readonly logger: Logger,
    private readonly taskService: TaskService,
    private readonly manualEntryService: ManualEntryService,
  ) {
    this.logger = new Logger(ReportBuilderService.name);
  }

  public buildTaskReport(task: TaskEntity): string {
    const comments = task.comments || 'Отсутствуют';
    const title = escapeHtml(task.title);
    return `Таска <a href="${task.url}">WA-${task.number}: ${title}</a>\nСтатус - ${task.state}\nКомментарии - ${comments}`;
  }

  public buildManualEntryReport(entry: ManualEntryEntity): string {
    const title = escapeHtml(entry.title);
    return `<a href="${entry.url}">${entry.key}: ${title}</a>\nКомментарии - ${entry.comment}`;
  }

  public buildDelegatedParentReport(
    task: TaskEntity,
    childrenCount: number,
  ): string {
    const title = escapeHtml(task.title);
    const subtaskWord = childrenCount === 1 ? 'подзадачи' : 'подзадач';
    return (
      `⏳ Таска <a href="${task.url}">WA-${task.number}: ${title}</a>\n` +
      `Статус - ${task.state}\n` +
      `Ожидает ревью ${subtaskWord}:`
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
        this.taskService.getDirtyTasks(),
        this.taskService.getTasksByState(TaskState.DEV_ANALYSIS),
        this.taskService.getTasksByState(TaskState.IN_PROGRESS),
        this.taskService.getTasksByState(
          TaskState.AWAITING_CLIENT_FEEDBACK,
          currentSprintOnly,
        ),
        this.taskService.getTasksByState(TaskState.BLOCKED, currentSprintOnly),
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
      const children = await this.taskService.getChildrenByParentIds(
        currentTaskCandidates.map((t) => t.externalId),
      );

      for (const child of children) {
        const siblings = childrenByParent.get(child.parentExternalId) ?? [];
        siblings.push(child);
        childrenByParent.set(child.parentExternalId, siblings);
      }
    }

    const hasReviewChild = (externalId: string): boolean =>
      (childrenByParent.get(externalId) ?? []).some(
        (child) => child.state === TaskState.UNDER_REVIEW,
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
      ...delegatedParents.map((task) => {
        const children = childrenByParent.get(task.externalId) ?? [];
        return {
          text: this.buildDelegatedParentReport(task, children.length),
          children: children.map((child) => this.buildChildTaskReport(child)),
        };
      }),
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
