import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { TaskService } from '../task/task.service';
import { ScriptRunnerService } from '../script-runner';
import { forEachPromise, extractError } from 'src/common/helpers';
import {
  BotCommands,
  GENERATE_TASK_REPORT_REGEX,
  GET_TASK_INFO_REGEX,
  SEPARATOR_REGEX,
  UPDATE_TASK_COMMENTS_REGEX,
} from './constants';
import { TaskEntity } from '../task/task.entity';
import { TASK_PAGE_SIZE } from '../task/constants';
import { entitiesToHtml } from './helpers';

const JIRA_SCRIPTS = {
  report24: {
    script: 'report_24h.py',
    label: '📋 Отчёт за 24ч',
    needsKey: false,
  },
  issue: {
    script: 'fetch_issue.py',
    label: '🔍 Детали задачи',
    needsKey: true,
  },
  comments: {
    script: 'get_comments.py',
    label: '💬 Комментарии',
    needsKey: true,
  },
  subtasks: {
    script: 'get_subtasks.py',
    label: '📂 Подзадачи',
    needsKey: true,
  },
  epic: {
    script: 'fetch_epic_children.py',
    label: '🏷 Дети эпика',
    needsKey: true,
  },
} as const;
@Injectable()
export class TelegramBotService {
  private bot: TelegramBot;
  private pendingJiraAction = new Map<number, string>();
  private privateChatIds = new Set<number>();

  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly taskService: TaskService,
    private readonly scriptRunner: ScriptRunnerService,
  ) {
    this.logger = new Logger(TelegramBotService.name);
    this.bot = new TelegramBot(
      this.configService.get<string>(`telegram-bot.token`),
      {
        polling: true,
      },
    );
  }

  public initBot() {
    this.logger.log('Initialized TG Bot');

    this.bot.setMyCommands([
      { command: 'start', description: 'Главное меню' },
      { command: 'list', description: 'Список задач' },
      { command: 'sync', description: 'Синхронизация из Jira' },
      { command: 'report', description: 'Отчет по выбранным таскам' },
      {
        command: 'report_auto',
        description: 'Автоотчет по задачам с комментариями',
      },
      { command: 'reset', description: 'Сбросить данные, начать новый период' },
      {
        command: 'jira',
        description: 'Jira: отчёт, детали, комментарии и др.',
      },
    ]);

    const mainMenu = {
      reply_markup: {
        inline_keyboard: [[{ text: 'Help', callback_data: 'help' }]],
        is_persistent: false,
      },
    };

    this.bot.onText(GET_TASK_INFO_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.getTaskHandler(msg.text, msg.chat.id);
    });

    this.bot.onText(UPDATE_TASK_COMMENTS_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.updateTaskHandler(msg, msg.chat.id);
    });

    this.bot.onText(BotCommands.START, (msg) => {
      this.trackPrivateChat(msg);
      const chatId = msg.chat.id;
      this.bot.sendMessage(
        chatId,
        'Добро пожаловать в меню. Выберите опцию:',
        mainMenu,
      );
    });

    this.bot.onText(BotCommands.REPORT, (msg) => {
      this.trackPrivateChat(msg);
      const chatId = msg.chat.id;
      this.bot
        .sendMessage(
          chatId,
          `Отправьте мне номера тасок, которые включить в отчет, через запятую в ответ на это сообщение
Рекомендую произвести синхронизацию данных перед генерацией отчета`,
        )
        .then(() => {
          const listener = async (replyMsg: TelegramBot.Message) => {
            const chatId = replyMsg.chat.id;
            try {
              this.bot.sendMessage(chatId, `Подготавливаю отчет ... `);
              const taskNumbers = replyMsg.text.split(',');
              let taskReport = '';
              await forEachPromise(
                taskNumbers,
                async (taskNumber: string, index) => {
                  const current =
                    await this.taskService.getTaskByKey(+taskNumber);
                  if (!current?.id) {
                    taskReport += `${index + 1}.Таска номер ${taskNumber} не найдена \n\n`;
                    return;
                  }
                  const taskInfo = this.taskService.buildTaskReport(current);
                  taskReport += `${index + 1}. ${taskInfo} \n\n`;
                },
              );
              await this.sendHtml(chatId, `Отчет по таскам \n\n ${taskReport}`);
            } catch (error: unknown) {
              const { message, stack } = extractError(error);
              this.logger.error(`Failed to generate report: ${message}`, stack);
              this.bot.sendMessage(chatId, 'Ошибка при генерации отчёта');
            } finally {
              this.bot.removeTextListener(GENERATE_TASK_REPORT_REGEX);
            }
          };
          this.bot.onText(GENERATE_TASK_REPORT_REGEX, listener);
        });
    });

    this.bot.onText(BotCommands.SYNC, async (msg) => {
      this.trackPrivateChat(msg);
      await this.syncTaskHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.LIST, async (msg) => {
      this.trackPrivateChat(msg);
      const chatId = msg.chat.id;
      try {
        const options = await this.generateInlineKeyboard(1);
        this.bot.sendMessage(chatId, 'Ваши задачи:', {
          reply_markup: options,
        });
      } catch (error: unknown) {
        const { message, stack } = extractError(error);
        this.logger.error(`Failed to list tasks: ${message}`, stack);
        this.bot.sendMessage(chatId, 'Ошибка при загрузке списка задач');
      }
    });

    this.bot.onText(BotCommands.REPORT_AUTO, async (msg) => {
      this.trackPrivateChat(msg);
      await this.reportAutoHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.RESET, async (msg) => {
      this.trackPrivateChat(msg);
      await this.separatorHandler(msg);
    });

    this.bot.onText(SEPARATOR_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.separatorHandler(msg);
    });

    this.bot.onText(BotCommands.JIRA, (msg) => {
      this.trackPrivateChat(msg);
      const keyboard = Object.entries(JIRA_SCRIPTS).map(([key, { label }]) => [
        { text: label, callback_data: `jira_${key}` },
      ]);
      this.bot.sendMessage(msg.chat.id, 'Выберите действие:', {
        reply_markup: { inline_keyboard: keyboard },
      });
    });

    this.bot.on('callback_query', async (callbackQuery) => {
      const message = callbackQuery.message;
      const chatId = message.chat.id;
      try {
        if (callbackQuery.data === 'help') {
          this.bot.sendMessage(
            chatId,
            `Доступные команды:
/report - отчет по выбранным таскам
/report_auto - автоотчет по задачам с комментариями
/jira - меню Jira-скриптов
/list - список задач
/sync - синхронизация из Jira

Обновить комментарий: <номер>: <текст>
/reset или ---- - сбросить данные, начать новый период`,
          );
          return;
        }
        if (callbackQuery.data.startsWith('jira_')) {
          const action = callbackQuery.data.replace('jira_', '');
          const config = JIRA_SCRIPTS[action];
          if (!config) return;

          this.bot.answerCallbackQuery(callbackQuery.id);

          if (!config.needsKey) {
            await this.runJiraScript(chatId, config.script);
            return;
          }

          this.pendingJiraAction.set(chatId, config.script);
          this.bot.sendMessage(
            chatId,
            'Введите ключ задачи (например, WA-123):',
            { reply_markup: { force_reply: true } },
          );
          return;
        }
        if (callbackQuery.data.startsWith('page_')) {
          const page = parseInt(callbackQuery.data.split('_')[1]);

          const options = await this.generateInlineKeyboard(page);

          this.bot.editMessageText('Ваши задачи:', {
            chat_id: chatId,
            message_id: message.message_id,
            reply_markup: options,
          });

          return;
        }
        if (callbackQuery.data.startsWith('WA_')) {
          const taskNumber = callbackQuery.data.split('_')[1];

          await this.getTaskHandler(taskNumber, chatId);

          return;
        }

        this.bot.answerCallbackQuery(callbackQuery.id, { show_alert: false });
      } catch (error: unknown) {
        const { message, stack } = extractError(error);
        this.logger.error(
          `Callback query error [${callbackQuery.data}]: ${message}`,
          stack,
        );
        this.bot.sendMessage(chatId, 'Произошла ошибка, попробуйте ещё раз');
      }
    });

    this.bot.on('polling_error', (error: Error) => {
      this.logger.error(
        `Telegram polling error: ${error.message}`,
        error.stack,
      );
    });

    this.bot.on('error', (error: Error) => {
      this.logger.error(`Telegram bot error: ${error.message}`, error.stack);
    });

    this.bot.on('message', async (msg) => {
      this.trackPrivateChat(msg);
      const chatId = msg.chat.id;
      const script = this.pendingJiraAction.get(chatId);
      if (!script || !msg.text || msg.text.startsWith('/')) return;

      this.pendingJiraAction.delete(chatId);
      const key = msg.text.trim();
      await this.runJiraScript(chatId, script, [key]);
    });
  }

  private trackPrivateChat(msg: TelegramBot.Message) {
    if (msg.chat.type === 'private') {
      this.privateChatIds.add(msg.chat.id);
    }
  }

  private async notifyOtherPrivateChats(excludeChatId: number, text: string) {
    for (const chatId of this.privateChatIds) {
      if (chatId === excludeChatId) continue;
      this.bot.sendMessage(chatId, text).catch((err) => {
        this.logger.warn(`Failed to notify chat ${chatId}: ${err.message}`);
      });
    }
  }

  private async getTaskHandler(messageText: string, chatId: number) {
    try {
      const task = await this.taskService.getTaskByKey(+messageText);
      if (!task?.id) {
        this.bot.sendMessage(chatId, `Таска с таким номером не найдена `);
        return;
      }

      const reply = this.taskService.buildTaskReport(task);
      await this.sendHtml(chatId, reply);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to get task [${messageText}]: ${message}`,
        stack,
      );
      this.bot.sendMessage(chatId, 'Ошибка при получении задачи');
    }
  }

  private async updateTaskHandler(msg: TelegramBot.Message, chatId: number) {
    try {
      const match = msg.text.match(UPDATE_TASK_COMMENTS_REGEX);
      const taskNumber = match[1];
      const rawComment = match[2];

      const task = await this.taskService.getTaskByKey(+taskNumber);
      if (!task?.id) {
        this.bot.sendMessage(chatId, `Таска с таким номером не найдена `);
        return;
      }

      const commentOffset = msg.text.length - rawComment.length;
      const comment = entitiesToHtml(rawComment, msg.entities, commentOffset);

      await this.taskService.update(task.id, {
        comments: comment,
        isCommentDirty: true,
      });
      this.bot.sendMessage(
        chatId,
        `Таска с номером ${taskNumber} успешно обновлена`,
      );
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to update task comment: ${message}`, stack);
      this.bot.sendMessage(chatId, 'Ошибка при обновлении комментария');
    }
  }

  private async reportAutoHandler(chatId: number) {
    try {
      const report = await this.taskService.generateAutoReport();

      if (!report) {
        this.bot.sendMessage(chatId, 'Нет задач с комментариями для отчёта');
        return;
      }

      await this.sendHtml(chatId, report);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to generate auto report: ${message}`, stack);
      this.bot.sendMessage(chatId, 'Ошибка при генерации автоотчёта');
    }
  }

  private async separatorHandler(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    try {
      const dirtyTasks = await this.taskService.getDirtyTasks();

      if (!dirtyTasks.length) {
        this.bot.sendMessage(chatId, 'Нет данных для сброса');
        return;
      }

      await this.taskService.resetDirtyFlags();
      this.bot.sendMessage(
        chatId,
        `———————————————————————————————\nДанные сброшены (${dirtyTasks.length} задач). Новый рабочий период начат.`,
      );

      const initiator = msg.from?.first_name || 'Кто-то';
      await this.notifyOtherPrivateChats(
        chatId,
        `🔴 ${initiator} сбросил(а) данные для отчёта (${dirtyTasks.length} задач). Новый период начат.`,
      );
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to reset data: ${message}`, stack);
      this.bot.sendMessage(chatId, 'Ошибка при сбросе данных');
    }
  }

  private async syncTaskHandler(chatId: number) {
    try {
      this.bot.sendMessage(
        chatId,
        'Синхронизирую данные. Сообщу, когда все будет готово',
      );
      await this.taskService.syncTaskData();
      this.bot.sendMessage(chatId, 'Готово');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to sync tasks: ${message}`, stack);
      this.bot.sendMessage(chatId, 'Ошибка при синхронизации задач');
    }
  }

  private async runJiraScript(
    chatId: number,
    scriptName: string,
    args: string[] = [],
  ) {
    this.bot.sendMessage(chatId, 'Загружаю данные из Jira...');
    try {
      const result = await this.scriptRunner.runScript(scriptName, args);
      await this.sendMarkdown(chatId, result || 'Пустой ответ');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Jira script error [${scriptName}]: ${message}`, stack);
      this.bot.sendMessage(chatId, `Ошибка при выполнении запроса: ${message}`);
    }
  }

  private async sendMarkdown(chatId: number, text: string): Promise<void> {
    try {
      await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (error: unknown) {
      const { message } = extractError(error);
      this.logger.warn(
        `Markdown send failed, retrying as plain text: ${message}`,
      );
      await this.bot.sendMessage(chatId, text, {
        disable_web_page_preview: true,
      });
    }
  }

  private async sendHtml(chatId: number, text: string): Promise<void> {
    const MAX_LENGTH = 4096;

    if (text.length <= MAX_LENGTH) {
      await this.bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      return;
    }

    const chunks = this.splitMessage(text, MAX_LENGTH);
    for (const chunk of chunks) {
      await this.bot.sendMessage(chatId, chunk, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      let splitAt = remaining.lastIndexOf('\n\n', maxLength);
      if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt <= 0) splitAt = maxLength;

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).replace(/^\n+/, '');
    }

    if (remaining) chunks.push(remaining);
    return chunks;
  }

  private async generateInlineKeyboard(
    page: number,
  ): Promise<TelegramBot.InlineKeyboardMarkup> {
    const { tasks, total } = await this.taskService.getTasks(page);
    const keyboard: { text: string; callback_data: string }[][] = tasks.map(
      (task: TaskEntity) => [
        {
          text: `WA-${task.number}: ${task.title}`,
          callback_data: `WA_${task.number}`,
        },
      ],
    );

    const navigation = [];

    if (page > 1)
      navigation.push({
        text: '⬅️',
        callback_data: page > 1 ? `page_${page - 1}` : 'null',
      });

    const hasNext = page * TASK_PAGE_SIZE < total;
    if (hasNext) {
      navigation.push({
        text: '➡️',
        callback_data: tasks.length ? `page_${page + 1}` : 'null',
      });
    }

    keyboard.push(navigation);

    return {
      inline_keyboard: keyboard,
    };
  }
}
