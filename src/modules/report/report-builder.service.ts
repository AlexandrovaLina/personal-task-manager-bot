import { Injectable, Logger } from '@nestjs/common';
import { escapeHtml, extractError } from 'src/common/helpers';
import {
  TaskService,
  TaskEntity,
  TaskState,
  DONE_STATES,
  NOT_STARTED_STATES,
} from '../task';
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

  public buildMixedChildrenReport(task: TaskEntity): string {
    return (
      `${this.buildTaskLink(task)}\n` +
      `${this.buildStatusLine(task.state)}${this.buildCommentLine(task)}\n` +
      `Статус по подзадачам:`
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
    onBoardOnly = false,
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
        this.taskService.getDirtyTasks(false, onBoardOnly),
        this.taskService.getTasksByState(
          TaskState.IN_PROGRESS,
          currentSprintOnly,
          onBoardOnly,
        ),
        this.taskService.getTasksByState(
          TaskState.AWAITING_CLIENT_FEEDBACK,
          currentSprintOnly,
          onBoardOnly,
        ),
        this.taskService.getTasksByState(
          TaskState.BLOCKED,
          currentSprintOnly,
          onBoardOnly,
        ),
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

    // Hide untouched subtasks (no comment, still in an unstarted state) from
    // a parent's grouping — they add noise without signalling any activity.
    const isChildRenderable = (child: TaskEntity): boolean =>
      Boolean(child.comments) || !NOT_STARTED_STATES.includes(child.state);
    const getRenderableChildren = (externalId: string): TaskEntity[] =>
      (childrenByParent.get(externalId) ?? []).filter(isChildRenderable);

    const nestedChildIds = new Set(
      [...childrenByParent.values()].flat().map((t) => t.id),
    );

    // True when at least one child is under review and none of the rest are
    // still genuinely active work — a Done-category sibling doesn't count as
    // "active", so (review + already-finished) still reads as pure review,
    // but (review + In Progress) does not.
    const isPureReview = (externalId: string): boolean => {
      const children = getRenderableChildren(externalId);
      return (
        children.some((child) => child.state === TaskState.UNDER_REVIEW) &&
        children.every(
          (child) =>
            child.state === TaskState.UNDER_REVIEW ||
            DONE_STATES.includes(child.state),
        )
      );
    };

    // A current-task-candidate that is itself already rendered as someone
    // else's nested child (e.g. its own status also happens to be current)
    // must not also be rendered again as a top-level item.
    const plainCurrentTasks = currentTaskCandidates.filter(
      (t) => !childrenByParent.has(t.externalId) && !nestedChildIds.has(t.id),
    );
    const delegatedParents = currentTaskCandidates.filter(
      (t) =>
        hasReviewChild(t.externalId) &&
        isPureReview(t.externalId) &&
        !nestedChildIds.has(t.id),
    );
    const mixedReviewParents = currentTaskCandidates.filter(
      (t) =>
        hasReviewChild(t.externalId) &&
        !isPureReview(t.externalId) &&
        !nestedChildIds.has(t.id),
    );
    const parentsWithChildren = currentTaskCandidates.filter(
      (t) =>
        childrenByParent.has(t.externalId) &&
        !hasReviewChild(t.externalId) &&
        !nestedChildIds.has(t.id),
    );

    const allChildrenDone = (externalId: string): boolean => {
      const children = childrenByParent.get(externalId) ?? [];
      return (
        children.length > 0 &&
        children.every((child) => DONE_STATES.includes(child.state))
      );
    };

    const dirtyTaskIds = new Set(dirtyTasks.map((t) => t.id));
    const mainParentsWithChildren = parentsWithChildren.filter(
      (t) => dirtyTaskIds.has(t.id) || allChildrenDone(t.externalId),
    );
    const plainParentsWithChildren = parentsWithChildren.filter(
      (t) => !dirtyTaskIds.has(t.id) && !allChildrenDone(t.externalId),
    );

    const mainMixedReviewParents = mixedReviewParents.filter((t) =>
      dirtyTaskIds.has(t.id),
    );
    const plainMixedReviewParents = mixedReviewParents.filter(
      (t) => !dirtyTaskIds.has(t.id),
    );

    const visibleAwaitingTasks = awaitingTasks.filter((t) => !t.isHidden);
    const visibleBlockedTasks = blockedTasks.filter((t) => !t.isHidden);

    const sectionIds = new Set(
      [
        ...plainCurrentTasks,
        ...parentsWithChildren,
        ...mixedReviewParents,
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

    // Non-current-candidate parents that still need to be shown for
    // context, from two sources that used to be handled separately (and
    // could conflict — a parent with some dirty children AND some merely
    // finished ones would only show the dirty subset):
    // - a dirty task's own parent, when that parent isn't itself dirty
    //   (otherwise the parent already renders via the second case below)
    // - a dirty task that is itself a parent of other tasks (dirty or not)
    const mainTaskExternalIds = new Set(mainTasks.map((t) => t.externalId));
    const referencedParentExternalIds = new Set(
      mainTasks
        .filter(
          (t) =>
            t.parentExternalId &&
            !currentCandidateExternalIds.has(t.parentExternalId) &&
            !mainTaskExternalIds.has(t.parentExternalId),
        )
        .map((t) => t.parentExternalId as string),
    );

    const [referencedParents, combinedChildren] = await Promise.all([
      this.taskService.getTasksByExternalIds([...referencedParentExternalIds]),
      this.taskService.getChildrenByParentIds([
        ...new Set([...referencedParentExternalIds, ...mainTaskExternalIds]),
      ]),
    ]);

    const referencedParentByExternalId = new Map(
      referencedParents.map((p) => [p.externalId, p]),
    );
    const combinedChildrenByParent = new Map<string, TaskEntity[]>();
    for (const child of combinedChildren) {
      const siblings =
        combinedChildrenByParent.get(child.parentExternalId) ?? [];
      siblings.push(child);
      combinedChildrenByParent.set(child.parentExternalId, siblings);
    }
    const getCombinedRenderableChildren = (externalId: string): TaskEntity[] =>
      (combinedChildrenByParent.get(externalId) ?? []).filter(
        isChildRenderable,
      );

    const mainTaskGroups = new Map<string, TaskEntity>();
    for (const externalId of referencedParentExternalIds) {
      const parent = referencedParentByExternalId.get(externalId);
      if (parent) mainTaskGroups.set(externalId, parent);
    }
    for (const task of mainTasks) {
      if (combinedChildrenByParent.has(task.externalId)) {
        mainTaskGroups.set(task.externalId, task);
      }
    }

    const combinedNestedChildIds = new Set(
      [...combinedChildrenByParent.values()].flat().map((t) => t.id),
    );

    const plainMainTasks = mainTasks.filter(
      (t) =>
        !mainTaskGroups.has(t.externalId) && !combinedNestedChildIds.has(t.id),
    );

    const currentManualEntries = manualEntries.filter((e) => e.isCurrent);
    const mainManualEntries = manualEntries.filter((e) => !e.isCurrent);

    const mainItems: ReportItem[] = [
      ...mainManualEntries.map((entry) => ({
        text: this.buildManualEntryReport(entry),
      })),
      ...delegatedParents.map((task) => {
        const children = getRenderableChildren(task.externalId);
        const reviewChildrenCount = children.filter(
          (child) => child.state === TaskState.UNDER_REVIEW,
        ).length;
        return {
          text: this.buildDelegatedParentReport(task, reviewChildrenCount),
          children: children.map((child) => this.buildChildTaskReport(child)),
        };
      }),
      ...[...mainTaskGroups.values()].map((parent) => ({
        text: this.buildParentWithChildrenReport(parent),
        children: getCombinedRenderableChildren(parent.externalId).map(
          (child) => this.buildChildTaskReport(child),
        ),
      })),
      ...mainParentsWithChildren.map((task) => ({
        text: this.buildParentWithChildrenReport(task),
        children: getRenderableChildren(task.externalId).map((child) =>
          this.buildChildTaskReport(child),
        ),
      })),
      ...mainMixedReviewParents.map((task) => ({
        text: this.buildMixedChildrenReport(task),
        children: getRenderableChildren(task.externalId).map((child) =>
          this.buildChildTaskReport(child),
        ),
      })),
      ...plainMainTasks.map((task) => ({ text: this.buildTaskReport(task) })),
    ];

    const currentItems: ReportItem[] = [
      ...currentManualEntries.map((entry) => ({
        text: this.buildManualEntryReport(entry),
      })),
      ...plainMixedReviewParents.map((task) => ({
        text: this.buildMixedChildrenReport(task),
        children: getRenderableChildren(task.externalId).map((child) =>
          this.buildChildTaskReport(child),
        ),
      })),
      ...plainParentsWithChildren.map((task) => ({
        text: this.buildParentWithChildrenReport(task),
        children: getRenderableChildren(task.externalId).map((child) =>
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
