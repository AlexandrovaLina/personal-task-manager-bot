import { Injectable, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { extractError } from 'src/common/helpers';
import { TaskService, TaskEntity } from '../../task';
import { ReportBuilderService } from '../../report';
import { TelegramMessengerService } from '../telegram-messenger.service';
import { UPDATE_TASK_COMMENTS_REGEX } from '../constants';
import { entitiesToHtml } from '../helpers';

const RECENT_SYNC_WINDOW_DAYS = 4;

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
      this.messenger.sendMessage(chatId, 'Ошибка при получении задачи');
    }
  }

  public async updateTaskHandler(msg: TelegramBot.Message, chatId: number) {
    try {
      const match = msg.text.match(UPDATE_TASK_COMMENTS_REGEX);
      if (!match) {
        this.messenger.sendMessage(
          chatId,
          'Неверный формат. Используйте: <номер>: <комментарий>',
        );
        return;
      }

      const taskNumber = match[1];
      const rawComment = match[2]?.trim();

      if (!rawComment) {
        this.messenger.sendMessage(chatId, 'Комментарий не может быть пустым');
        return;
      }

      const task = await this.taskService.getTaskByKey(+taskNumber);
      if (!task?.id) {
        this.messenger.sendMessage(
          chatId,
          `❗️❗️❗️ Таска с таким номером не найдена ❗️❗️❗️`,
        );
        return;
      }

      const commentOffset = msg.text.length - rawComment.length;
      const comment = entitiesToHtml(rawComment, msg.entities, commentOffset);

      await this.taskService.update(task.id, {
        comments: comment,
        isCommentDirty: true,
      });
      this.messenger.sendMessage(
        chatId,
        `Таска с номером ${taskNumber} успешно обновлена`,
      );
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to update task comment: ${message}`, stack);
      this.messenger.sendMessage(chatId, 'Ошибка при обновлении комментария');
    }
  }

  public async reportAutoHandler(chatId: number, currentSprintOnly = false) {
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

      const report =
        await this.reportBuilderService.generateAutoReport(currentSprintOnly);

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
      this.messenger.sendMessage(chatId, 'Ошибка при генерации автоотчёта');
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
      this.messenger.sendMessage(chatId, 'Ошибка при загрузке списка задач');
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
      this.messenger.sendMessage(chatId, 'Ошибка при синхронизации задач');
    }
  }
}
