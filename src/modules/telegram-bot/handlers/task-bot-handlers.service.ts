import { Injectable, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { extractError } from 'src/common/helpers';
import { TaskService, TaskEntity } from '../../task';
import { ReportBuilderService } from '../../report';
import { TelegramMessengerService } from '../telegram-messenger.service';
import { NEXT_PLANNED_REGEX } from '../constants';
import {
  entitiesToHtml,
  splitTaskCommentBatch,
  TaskCommentSegment,
} from '../helpers';

const RECENT_SYNC_WINDOW_DAYS = 4;

type CommentUpdateOutcome = 'updated' | 'cleared' | 'not_found' | 'failed';

interface CommentUpdateResult {
  outcome: CommentUpdateOutcome;
  error?: string;
}

interface BatchCommentResult extends CommentUpdateResult {
  taskNumber: number;
}

@Injectable()
export class TaskBotHandlers {
  constructor(
    private readonly logger: Logger,
    private readonly messenger: TelegramMessengerService,
    private readonly taskService: TaskService,
    private readonly reportBuilderService: ReportBuilderService,
  ) {
    this.logger = new Logger(TaskBotHandlers.name);
  }

  public async getTaskHandler(messageText: string, chatId: number) {
    try {
      const taskNumber = Number(messageText);
      if (!Number.isInteger(taskNumber) || taskNumber <= 0) {
        this.messenger.sendMessage(
          chatId,
          'Номер задачи должен быть положительным целым числом',
        );
        return;
      }

      const task = await this.taskService.getTaskByKey(taskNumber);
      if (!task?.id) {
        this.messenger.sendMessage(
          chatId,
          `❗️❗️❗️ Таска с таким номером не найдена ❗️❗️❗️`,
        );
        return;
      }

      const reply = this.reportBuilderService.buildTaskReport(task);
      await this.messenger.sendHtml(chatId, reply);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to get task [${messageText}]: ${message}`,
        stack,
      );
      this.messenger.sendMessage(
        chatId,
        `Ошибка при получении задачи: ${message}`,
      );
    }
  }

  // Accepts one `<number>: <comment>` or several of them, each starting on
  // its own line — every segment updates (or clears) its own ticket.
  public async updateTaskHandler(msg: TelegramBot.Message, chatId: number) {
    const segments = splitTaskCommentBatch(msg.text ?? '');
    if (!segments.length) {
      this.messenger.sendMessage(
        chatId,
        'Неверный формат. Используйте: <номер>: <комментарий>',
      );
      return;
    }

    if (segments.length === 1) {
      const [segment] = segments;
      const result = await this.applyTaskComment(segment, msg.entities);
      this.messenger.sendMessage(
        chatId,
        this.formatSingleCommentResult(segment.taskNumber, result),
      );
      return;
    }

    const results: BatchCommentResult[] = [];
    for (const segment of segments) {
      const result = await this.applyTaskComment(segment, msg.entities);
      results.push({ taskNumber: segment.taskNumber, ...result });
    }
    this.messenger.sendMessage(chatId, this.formatBatchCommentResult(results));
  }

  private async applyTaskComment(
    segment: TaskCommentSegment,
    entities?: TelegramBot.MessageEntity[],
  ): Promise<CommentUpdateResult> {
    try {
      const task = await this.taskService.getTaskByKey(segment.taskNumber);
      if (!task?.id) return { outcome: 'not_found' };

      if (!segment.rawComment) {
        await this.taskService.update(task.id, {
          comments: null,
          isCommentDirty: false,
        });
        return { outcome: 'cleared' };
      }

      const comment = entitiesToHtml(
        segment.rawComment,
        entities,
        segment.commentOffset,
      );
      await this.taskService.update(task.id, {
        comments: comment,
        isCommentDirty: true,
      });
      return { outcome: 'updated' };
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to update comment for task ${segment.taskNumber}: ${message}`,
        stack,
      );
      return { outcome: 'failed', error: message };
    }
  }

  private formatSingleCommentResult(
    taskNumber: number,
    result: CommentUpdateResult,
  ): string {
    switch (result.outcome) {
      case 'updated':
        return `Таска с номером ${taskNumber} успешно обновлена`;
      case 'cleared':
        return `Комментарий к таске с номером ${taskNumber} очищен`;
      case 'not_found':
        return `❗️❗️❗️ Таска с таким номером не найдена ❗️❗️❗️`;
      case 'failed':
        return `Ошибка при обновлении комментария: ${result.error}`;
    }
  }

  private formatBatchCommentResult(results: BatchCommentResult[]): string {
    const numbersWith = (outcome: CommentUpdateOutcome) =>
      results
        .filter((r) => r.outcome === outcome)
        .map((r) => r.taskNumber)
        .join(', ');

    const lines: string[] = [];
    const updated = numbersWith('updated');
    const cleared = numbersWith('cleared');
    const notFound = numbersWith('not_found');
    if (updated) lines.push(`✅ Обновлены: ${updated}`);
    if (cleared) lines.push(`🧹 Очищены: ${cleared}`);
    if (notFound) lines.push(`❗️ Не найдены: ${notFound}`);
    for (const r of results.filter((r) => r.outcome === 'failed')) {
      lines.push(`❗️ Ошибка у ${r.taskNumber}: ${r.error}`);
    }
    return lines.join('\n');
  }

  public async reportAutoHandler(chatId: number) {
    try {
      try {
        await this.taskService.syncTaskData(RECENT_SYNC_WINDOW_DAYS);
      } catch (syncError: unknown) {
        const { message, stack } = extractError(syncError);
        this.logger.error(`Auto-sync before report failed: ${message}`, stack);
        this.messenger.sendMessage(
          chatId,
          '⚠️ Не удалось синхронизировать недавние обновления из Jira — отчёт построен по текущим данным в БД',
        );
      }

      const report = await this.reportBuilderService.generateAutoReport();

      if (!report) {
        this.messenger.sendMessage(
          chatId,
          'Нет задач с комментариями для отчёта',
        );
        return;
      }

      await this.messenger.sendHtml(chatId, report);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to generate auto report: ${message}`, stack);
      this.messenger.sendMessage(
        chatId,
        `Ошибка при генерации автоотчёта: ${message}`,
      );
    }
  }

  public async hiddenHandler(chatId: number) {
    try {
      const keyboard = await this.buildHiddenKeyboard();

      if (!keyboard.inline_keyboard.length) {
        this.messenger.sendMessage(
          chatId,
          'Нет задач в статусах Awaiting Client Feedback / Blocked',
        );
        return;
      }

      this.messenger.sendMessage(
        chatId,
        '🙈 — скрыта из автоотчёта, 👁 — показывается.\nНажмите на задачу, чтобы переключить видимость:',
        { reply_markup: keyboard },
      );
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to build hidden tasks menu: ${message}`, stack);
      this.messenger.sendMessage(
        chatId,
        `Ошибка при загрузке списка задач: ${message}`,
      );
    }
  }

  public async toggleHiddenHandler(
    taskNumber: number,
    chatId: number,
    messageId: number,
    callbackQueryId: string,
  ) {
    if (!Number.isInteger(taskNumber) || taskNumber <= 0) return;

    const task = await this.taskService.getTaskByKey(taskNumber);
    if (!task?.id) {
      this.messenger.bot.answerCallbackQuery(callbackQueryId, {
        text: 'Задача не найдена',
        show_alert: true,
      });
      return;
    }

    await this.taskService.setTaskHidden(task.id, !task.isHidden);

    this.messenger.bot.answerCallbackQuery(callbackQueryId, {
      text: task.isHidden
        ? `WA-${task.number} теперь в автоотчёте`
        : `WA-${task.number} скрыта из автоотчёта`,
    });

    const keyboard = await this.buildHiddenKeyboard();
    this.messenger.bot.editMessageReplyMarkup(keyboard, {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  private async buildHiddenKeyboard(): Promise<TelegramBot.InlineKeyboardMarkup> {
    const tasks = await this.taskService.getHideableTasks();

    return {
      inline_keyboard: tasks.map((task: TaskEntity) => [
        {
          text: `${task.isHidden ? '🙈' : '👁'} WA-${task.number}: ${task.title}`,
          callback_data: `hide_${task.number}`,
        },
      ]),
    };
  }

  public async nextPlannedHandler(msg: TelegramBot.Message, chatId: number) {
    try {
      const match = msg.text.match(NEXT_PLANNED_REGEX);
      const taskNumber = match ? +match[1] : NaN;

      const task = await this.taskService.getTaskByKey(taskNumber);
      if (!task?.id) {
        this.messenger.sendMessage(
          chatId,
          `❗️❗️❗️ Таска с таким номером не найдена ❗️❗️❗️`,
        );
        return;
      }

      await this.taskService.setNextPlannedTask(task.id);
      this.messenger.sendMessage(
        chatId,
        `WA-${task.number} отмечена как следующая по плану`,
      );
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to set next planned task: ${message}`, stack);
      this.messenger.sendMessage(
        chatId,
        `Ошибка при отметке задачи: ${message}`,
      );
    }
  }

  public async clearNextPlannedHandler(chatId: number) {
    try {
      await this.taskService.clearNextPlannedTask();
      this.messenger.sendMessage(chatId, 'Отметка «следующая по плану» снята');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to clear next planned task: ${message}`, stack);
      this.messenger.sendMessage(
        chatId,
        `Ошибка при снятии отметки: ${message}`,
      );
    }
  }

  public async syncFullTaskHandler(chatId: number) {
    try {
      this.messenger.sendMessage(
        chatId,
        'Полная синхронизация всех задач — может занять несколько секунд...',
      );
      await this.taskService.syncTaskData();
      this.messenger.sendMessage(chatId, 'Готово');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to full-sync tasks: ${message}`, stack);
      this.messenger.sendMessage(
        chatId,
        `Ошибка при синхронизации задач: ${message}`,
      );
    }
  }
}
