import { Injectable, Logger } from '@nestjs/common';
import { escapeHtml, extractError } from 'src/common/helpers';
import { TaskService, TaskEntity, TaskState } from '../task';
import { ManualEntryService, ManualEntryEntity } from '../manual-entry';
import { ReportHeader, STATUS_EMOJI, DEFAULT_STATUS_EMOJI } from './constants';

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

  private buildStatusLine(state: string): string {
    const emoji = STATUS_EMOJI[state] ?? DEFAULT_STATUS_EMOJI;
    return `<b>Статус</b> - ${emoji} ${state}`;
  }

  private buildTaskLink(task: TaskEntity): string {
    const title = escapeHtml(task.title);
    return `<a href="${task.url}"><b>WA-${task.number}</b>: ${title}</a>`;
  }

  public buildTaskReport(task: TaskEntity): string {
    const comments = task.comments || 'Отсутствуют';
    return `${this.buildTaskLink(task)}\n${this.buildStatusLine(task.state)}\n<b>Комментарии</b> - ${comments}`;
  }

  public buildManualEntryReport(entry: ManualEntryEntity): string {
    const title = escapeHtml(entry.title);
    return `<a href="${entry.url}"><b>${entry.key}</b>: ${title}</a>\n<b>Комментарии</b> - ${entry.comment}`;
  }

  private buildCommentLine(task: TaskEntity): string {
    return task.comments ? `\n<b>Комментарии</b> - ${task.comments}` : '';
  }

  public buildDelegatedParentReport(
    task: TaskEntity,
    childrenCount: number,
  ): string {
    const subtaskWord = childrenCount === 1 ? 'подзадачи' : 'подзадач';
    return (
      `⏳ ${this.buildTaskLink(task)}\n` +
      `${this.buildStatusLine(task.state)}${this.buildCommentLine(task)}\n` +
      `Ожидает ревью ${subtaskWord}:`
    );
  }

  public buildParentWithChildrenReport(task: TaskEntity): string {
    return (
      `${this.buildTaskLink(task)}\n` +
      `${this.buildStatusLine(task.state)}${this.buildCommentLine(task)}\n` +
      `Это родительская таска для:`
    );
  }

  public buildChildTaskReport(task: TaskEntity): string {
    return `<blockquote>${this.buildTaskReport(task)}</blockquote>`;
  }

  public buildNextPlannedReport(task: TaskEntity): string {
    return (
      `${ReportHeader.NEXT_PLANNED}\n` +
      `${this.buildTaskLink(task)}\n` +
      `${this.buildStatusLine(task.state)}`
    );
  }

  private buildSection(
    items: ReportItem[],
    counter: { value: number },
    header?: ReportHeader,
  ): string | null {
    if (!items.length) return null;

    const rendered = items.map((item) => {
      const numbered = `<b>${counter.value++}.</b> ${item.text}`;
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
      inProgressTasks: TaskEntity[],
      awaitingTasks: TaskEntity[],
      blockedTasks: TaskEntity[],
      manualEntries: ManualEntryEntity[];

    try {
      [
        dirtyTasks,
        inProgressTasks,
        awaitingTasks,
        blockedTasks,
        manualEntries,
      ] = await Promise.all([
        this.taskService.getDirtyTasks(),
        this.taskService.getTasksByState(
          TaskState.IN_PROGRESS,
          currentSprintOnly,
        ),
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

    const currentTaskCandidates = inProgressTasks;

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

    const nestedChildIds = new Set(
      [...childrenByParent.values()].flat().map((t) => t.id),
    );

    // A current-task-candidate that is itself already rendered as someone
    // else's nested child (e.g. its own status also happens to be current)
    // must not also be rendered again as a top-level item.
    const plainCurrentTasks = currentTaskCandidates.filter(
      (t) => !childrenByParent.has(t.externalId) && !nestedChildIds.has(t.id),
    );
    const delegatedParents = currentTaskCandidates.filter(
      (t) => hasReviewChild(t.externalId) && !nestedChildIds.has(t.id),
    );
    const parentsWithChildren = currentTaskCandidates.filter(
      (t) =>
        childrenByParent.has(t.externalId) &&
        !hasReviewChild(t.externalId) &&
        !nestedChildIds.has(t.id),
    );

    const dirtyTaskIds = new Set(dirtyTasks.map((t) => t.id));
    const dirtyParentsWithChildren = parentsWithChildren.filter((t) =>
      dirtyTaskIds.has(t.id),
    );
    const plainParentsWithChildren = parentsWithChildren.filter(
      (t) => !dirtyTaskIds.has(t.id),
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

    const currentCandidateExternalIds = new Set(
      currentTaskCandidates.map((t) => t.externalId),
    );

    const tasksNeedingParentContext = mainTasks.filter(
      (t) =>
        t.parentExternalId &&
        !currentCandidateExternalIds.has(t.parentExternalId),
    );
    const contextParents = await this.taskService.getTasksByExternalIds([
      ...new Set(
        tasksNeedingParentContext.map((t) => t.parentExternalId as string),
      ),
    ]);
    const contextParentByExternalId = new Map(
      contextParents.map((p) => [p.externalId, p]),
    );

    const mainTaskGroups = new Map<
      string,
      { parent: TaskEntity; children: TaskEntity[] }
    >();
    for (const task of tasksNeedingParentContext) {
      const parent = contextParentByExternalId.get(
        task.parentExternalId as string,
      );
      if (!parent) continue;

      const group = mainTaskGroups.get(parent.externalId) ?? {
        parent,
        children: [],
      };
      group.children.push(task);
      mainTaskGroups.set(parent.externalId, group);
    }

    const plainMainTasks = mainTasks.filter(
      (t) =>
        !mainTaskGroups.has(t.externalId) &&
        !(t.parentExternalId && mainTaskGroups.has(t.parentExternalId)),
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
      ...[...mainTaskGroups.values()].map(({ parent, children }) => ({
        text: this.buildParentWithChildrenReport(parent),
        children: children.map((child) => this.buildChildTaskReport(child)),
      })),
      ...dirtyParentsWithChildren.map((task) => ({
        text: this.buildParentWithChildrenReport(task),
        children: (childrenByParent.get(task.externalId) ?? []).map((child) =>
          this.buildChildTaskReport(child),
        ),
      })),
      ...plainMainTasks.map((task) => ({ text: this.buildTaskReport(task) })),
    ];

    const currentItems: ReportItem[] = [
      ...currentManualEntries.map((entry) => ({
        text: this.buildManualEntryReport(entry),
      })),
      ...plainParentsWithChildren.map((task) => ({
        text: this.buildParentWithChildrenReport(task),
        children: (childrenByParent.get(task.externalId) ?? []).map((child) =>
          this.buildChildTaskReport(child),
        ),
      })),
      ...plainCurrentTasks.map((task) => ({
        text: this.buildTaskReport(task),
      })),
    ];

    const nextPlannedTask = await this.taskService.getNextPlannedTask();

    const counter = { value: 1 };
    const mainSection = this.buildSection(mainItems, counter);

    const currentBody = this.buildSection(currentItems, counter);
    const nextPlannedBlock = nextPlannedTask
      ? this.buildNextPlannedReport(nextPlannedTask)
      : null;
    const currentSectionParts = [currentBody, nextPlannedBlock].filter(
      Boolean,
    ) as string[];
    const currentSection = currentSectionParts.length
      ? `${ReportHeader.CURRENT}\n\n${currentSectionParts.join('\n\n')}`
      : null;

    const sections = [
      mainSection,
      currentSection,
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
