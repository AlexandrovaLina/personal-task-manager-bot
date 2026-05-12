import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { TaskService } from '../task/task.service';
import { ScriptRunnerService } from '../script-runner';
import { forEachPromise } from 'src/common/helpers';
import {
  BotCommands,
  GENERATE_TASK_REPORT_REGEX,
  GET_TASK_INFO_REGEX,
  SEPARATOR_REGEX,
  UPDATE_TASK_COMMENTS_REGEX,
} from './constants';
import { TaskEntity } from '../task/task.entity';
import { TASK_PAGE_SIZE } from '../task/constants';

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
      await this.getTaskHandler(msg.text, msg.chat.id);
    });

    this.bot.onText(UPDATE_TASK_COMMENTS_REGEX, async (msg) => {
      await this.updateTaskHandler(msg.text, msg.chat.id);
    });

    this.bot.onText(BotCommands.START, (msg) => {
      const chatId = msg.chat.id;
      this.bot.sendMessage(
        chatId,
        'Добро пожаловать в меню. Выберите опцию:',
        mainMenu,
      );
    });

    this.bot.onText(BotCommands.REPORT, (msg) => {
      const chatId = msg.chat.id;
      this.bot
        .sendMessage(
          chatId,
          `Отправьте мне номера тасок, которые включить в отчет, через запятую в ответ на это сообщение
Рекомендую произвести синхронизацию данных перед генерацией отчета`,
        )
        .then(() => {
          const listener = async (replyMsg: TelegramBot.Message) => {
            this.bot.sendMessage(replyMsg.chat.id, `Подготавливаю отчет ... `);
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
            this.bot.sendMessage(
              replyMsg.chat.id,
              `Отчет по таскам \n\n ${taskReport}`,
              { parse_mode: 'Markdown' },
            );
            this.bot.removeTextListener(GENERATE_TASK_REPORT_REGEX);
          };
          this.bot.onText(GENERATE_TASK_REPORT_REGEX, listener);
        });
    });

    this.bot.onText(BotCommands.SYNC, async (msg) => {
      await this.syncTaskHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.LIST, async (msg) => {
      const chatId = msg.chat.id;
      const options = await this.generateInlineKeyboard(1);
      this.bot.sendMessage(chatId, 'Ваши задачи:', {
        reply_markup: options,
      });
    });

    this.bot.onText(BotCommands.REPORT_AUTO, async (msg) => {
      await this.reportAutoHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.RESET, async (msg) => {
      await this.separatorHandler(msg.chat.id);
    });

    this.bot.onText(SEPARATOR_REGEX, async (msg) => {
      await this.separatorHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.JIRA, (msg) => {
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
    });

    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const script = this.pendingJiraAction.get(chatId);
      if (!script || !msg.text || msg.text.startsWith('/')) return;

      this.pendingJiraAction.delete(chatId);
      const key = msg.text.trim();
      await this.runJiraScript(chatId, script, [key]);
    });
  }

  private async getTaskHandler(messageText: string, chatId: number) {
    const task = await this.taskService.getTaskByKey(+messageText);
    if (!task?.id) {
      this.bot.sendMessage(chatId, `Таска с таким номером не найдена `);
      return;
    }

    const reply = this.taskService.buildTaskReport(task);
    this.bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  }

  private async updateTaskHandler(messageText: string, chatId: number) {
    const match = messageText.match(UPDATE_TASK_COMMENTS_REGEX);
    const taskNumber = match[1];
    const comment = match[2];

    const task = await this.taskService.getTaskByKey(+taskNumber);
    if (!task?.id) {
      this.bot.sendMessage(chatId, `Таска с таким номером не найдена `);
      return;
    }

    await this.taskService.update(task.id, {
      comments: comment,
      isCommentDirty: true,
    });
    this.bot.sendMessage(
      chatId,
      `Таска с номером ${taskNumber} успешно обновлена`,
    );
  }

  private async reportAutoHandler(chatId: number) {
    const report = await this.taskService.generateAutoReport();

    if (!report) {
      this.bot.sendMessage(chatId, 'Нет задач с комментариями для отчёта');
      return;
    }

    this.bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
  }

  private async separatorHandler(chatId: number) {
    const dirtyTasks = await this.taskService.getDirtyTasks();

    if (!dirtyTasks.length) {
      this.bot.sendMessage(chatId, 'Нет данных для сброса');
      return;
    }

    await this.taskService.resetDirtyFlags();
    this.bot.sendMessage(
      chatId,
      `Данные сброшены (${dirtyTasks.length} задач). Новый рабочий период начат.`,
    );
  }

  private async syncTaskHandler(chatId: number) {
    this.bot.sendMessage(
      chatId,
      'Синхронизирую данные. Сообщу, когда все будет готово',
    );
    await this.taskService.syncTaskData();
    this.bot.sendMessage(chatId, 'Готово');
  }

  private async runJiraScript(
    chatId: number,
    scriptName: string,
    args: string[] = [],
  ) {
    this.bot.sendMessage(chatId, 'Загружаю данные из Jira...');
    try {
      const result = await this.scriptRunner.runScript(scriptName, args);
      await this.bot.sendMessage(chatId, result || 'Пустой ответ', {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Jira script error [${scriptName}]:`, message);
      this.bot.sendMessage(chatId, `Ошибка при выполнении запроса: ${message}`);
    }
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
