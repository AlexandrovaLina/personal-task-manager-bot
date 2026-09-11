import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { TaskService } from '../task';
import { ManualEntryService } from '../manual-entry';
import { extractError } from 'src/common/helpers';
import {
  BotCommands,
  GET_TASK_INFO_REGEX,
  MANUAL_ENTRY_REGEX,
  MANUAL_ENTRY_KEY_REGEX,
  SEPARATOR_REGEX,
  UPDATE_TASK_COMMENTS_REGEX,
  NEXT_PLANNED_REGEX,
  NEXT_PLANNED_CLEAR_REGEX,
} from './constants';
import { TelegramMessengerService } from './telegram-messenger.service';
import {
  TaskBotHandlers,
  ManualEntryBotHandlers,
  CalendarBotHandlers,
  JiraReportBotHandlers,
  ChatBotHandlers,
} from './handlers';

@Injectable()
export class TelegramBotService {
  private privateChatIds = new Set<number>();

  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly messenger: TelegramMessengerService,
    private readonly taskService: TaskService,
    private readonly manualEntryService: ManualEntryService,
    private readonly taskHandlers: TaskBotHandlers,
    private readonly manualEntryHandlers: ManualEntryBotHandlers,
    private readonly calendarHandlers: CalendarBotHandlers,
    private readonly jiraReportHandlers: JiraReportBotHandlers,
    private readonly chatHandlers: ChatBotHandlers,
  ) {
    this.logger = new Logger(TelegramBotService.name);
  }

  private get bot(): TelegramBot {
    return this.messenger.bot;
  }

  public initBot() {
    this.logger.log('Initialized TG Bot');

    this.bot.setMyCommands([
      { command: 'start', description: 'Главное меню' },
      { command: 'sync_full', description: 'Полная синхронизация из Jira' },
      {
        command: 'report_auto',
        description: 'Автоотчет по задачам с комментариями',
      },
      {
        command: 'report_auto_sprint',
        description: 'Автоотчет по задачам текущего спринта',
      },
      { command: 'reset', description: 'Сбросить данные, начать новый период' },
      { command: 'report24', description: 'Отчёт за 24ч из Jira' },
      { command: 'calls', description: 'Созвоны на сегодня' },
      {
        command: 'sync_calls',
        description: 'Синхронизация созвонов из календаря',
      },
      {
        command: 'hidden',
        description: 'Видимость заблокированных/ожидающих задач в автоотчёте',
      },
      {
        command: 'chats',
        description: 'Список чатов бота (переименование, разрешение писать)',
      },
      {
        command: 'next',
        description: 'Отметить задачу как "следующая по плану" (/next <номер>)',
      },
      {
        command: 'next_clear',
        description: 'Снять отметку "следующая по плану"',
      },
    ]);

    const mainMenu = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📊 Автоотчёт', callback_data: 'menu_report_auto' },
            {
              text: '📊 Автоотчёт (спринт)',
              callback_data: 'menu_report_auto_sprint',
            },
          ],
          [{ text: '📋 Отчёт за 24ч', callback_data: 'menu_report24' }],
          [{ text: '📅 Созвоны сегодня', callback_data: 'menu_calls' }],
          [
            { text: '🔄 Синк Jira (полный)', callback_data: 'menu_sync_full' },
            { text: '🔄 Синк календаря', callback_data: 'menu_sync_calls' },
          ],
          [{ text: '🙈 Скрытые задачи', callback_data: 'menu_hidden' }],
          [{ text: '💬 Чаты', callback_data: 'menu_chats' }],
          [{ text: '🔴 Сброс периода', callback_data: 'menu_reset' }],
          [{ text: '❓ Help', callback_data: 'help' }],
        ],
        is_persistent: false,
      },
    };

    this.bot.onText(GET_TASK_INFO_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.taskHandlers.getTaskHandler(msg.text, msg.chat.id);
    });

    this.bot.onText(UPDATE_TASK_COMMENTS_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.taskHandlers.updateTaskHandler(msg, msg.chat.id);
    });

    this.bot.onText(MANUAL_ENTRY_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.manualEntryHandlers.manualEntryHandler(msg);
    });

    this.bot.onText(MANUAL_ENTRY_KEY_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.manualEntryHandlers.manualEntryInfoHandler(
        msg.text,
        msg.chat.id,
      );
    });

    this.bot.onText(BotCommands.START, (msg) => {
      this.trackPrivateChat(msg);
      const chatId = msg.chat.id;
      this.messenger.sendMessage(
        chatId,
        'Добро пожаловать в меню. Выберите опцию:',
        mainMenu,
      );
    });

    this.bot.onText(BotCommands.SYNC_FULL, async (msg) => {
      this.trackPrivateChat(msg);
      await this.taskHandlers.syncFullTaskHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.SYNC_CALLS, async (msg) => {
      this.trackPrivateChat(msg);
      await this.calendarHandlers.syncCallsHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.REPORT_AUTO, async (msg) => {
      this.trackPrivateChat(msg);
      await this.taskHandlers.reportAutoHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.REPORT_AUTO_SPRINT, async (msg) => {
      this.trackPrivateChat(msg);
      await this.taskHandlers.reportAutoHandler(msg.chat.id, true);
    });

    this.bot.onText(BotCommands.RESET, async (msg) => {
      this.trackPrivateChat(msg);
      await this.separatorHandler(msg);
    });

    this.bot.onText(SEPARATOR_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.separatorHandler(msg);
    });

    this.bot.onText(BotCommands.CALLS, async (msg) => {
      this.trackPrivateChat(msg);
      await this.calendarHandlers.callsHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.HIDDEN, async (msg) => {
      this.trackPrivateChat(msg);
      await this.taskHandlers.hiddenHandler(msg.chat.id);
    });

    this.bot.onText(BotCommands.REPORT24, async (msg) => {
      this.trackPrivateChat(msg);
      await this.jiraReportHandlers.report24Handler(msg.chat.id);
    });

    this.bot.onText(BotCommands.CHATS, async (msg) => {
      this.trackPrivateChat(msg);
      await this.chatHandlers.listChatsHandler(msg.chat.id);
    });

    this.bot.onText(NEXT_PLANNED_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.taskHandlers.nextPlannedHandler(msg, msg.chat.id);
    });

    this.bot.onText(NEXT_PLANNED_CLEAR_REGEX, async (msg) => {
      this.trackPrivateChat(msg);
      await this.taskHandlers.clearNextPlannedHandler(msg.chat.id);
    });

    this.bot.on('callback_query', async (callbackQuery) => {
      const message = callbackQuery.message;
      const chatId = message.chat.id;
      try {
        if (callbackQuery.data === 'help') {
          this.messenger.sendMessage(
            chatId,
            `Доступные команды:
/report_auto - автоотчет по задачам с комментариями
/report_auto_sprint - автоотчет по задачам текущего спринта
/report24 - отчёт за 24ч из Jira
/calls - созвоны на сегодня
/sync_calls - синхронизация созвонов из календаря
/hidden - видимость заблокированных/ожидающих задач в автоотчёте
/sync_full - полная синхронизация из Jira (автоотчёты синхронизируют недавние обновления сами)
/chats - список чатов бота (переименование, разрешение писать)
/next <номер> - отметить задачу как "следующая по плану"
/next_clear - снять отметку "следующая по плану"

Обновить комментарий: <номер>: <текст>
/reset или —— - сбросить данные, начать новый период`,
          );
          return;
        }
        if (callbackQuery.data.startsWith('menu_')) {
          this.bot.answerCallbackQuery(callbackQuery.id);
          const action = callbackQuery.data.replace('menu_', '');

          switch (action) {
            case 'report_auto':
              await this.taskHandlers.reportAutoHandler(chatId);
              break;
            case 'report_auto_sprint':
              await this.taskHandlers.reportAutoHandler(chatId, true);
              break;
            case 'report24':
              await this.jiraReportHandlers.report24Handler(chatId);
              break;
            case 'calls':
              await this.calendarHandlers.callsHandler(chatId);
              break;
            case 'sync_full':
              await this.taskHandlers.syncFullTaskHandler(chatId);
              break;
            case 'sync_calls':
              await this.calendarHandlers.syncCallsHandler(chatId);
              break;
            case 'hidden':
              await this.taskHandlers.hiddenHandler(chatId);
              break;
            case 'chats':
              await this.chatHandlers.listChatsHandler(chatId);
              break;
            case 'reset':
              await this.resetHandler(
                chatId,
                callbackQuery.from?.first_name || 'Кто-то',
              );
              break;
          }

          return;
        }
        if (callbackQuery.data.startsWith('manual_current_')) {
          const key = callbackQuery.data.replace('manual_current_', '');
          await this.manualEntryHandlers.manualEntryMarkCurrentHandler(
            key,
            chatId,
            message.message_id,
            callbackQuery.id,
          );

          return;
        }
        if (callbackQuery.data.startsWith('hide_')) {
          const taskNumber = parseInt(callbackQuery.data.split('_')[1], 10);
          await this.taskHandlers.toggleHiddenHandler(
            taskNumber,
            chatId,
            message.message_id,
            callbackQuery.id,
          );

          return;
        }
        if (callbackQuery.data.startsWith('chat_rename_')) {
          const targetChatId = callbackQuery.data.replace('chat_rename_', '');
          await this.chatHandlers.startRenameHandler(
            chatId,
            targetChatId,
            callbackQuery.id,
          );

          return;
        }
        if (callbackQuery.data.startsWith('chat_toggle_')) {
          const targetChatId = callbackQuery.data.replace('chat_toggle_', '');
          await this.chatHandlers.toggleWriteHandler(
            targetChatId,
            chatId,
            message.message_id,
            callbackQuery.id,
          );

          return;
        }

        this.bot.answerCallbackQuery(callbackQuery.id, { show_alert: false });
      } catch (error: unknown) {
        const { message, stack } = extractError(error);
        this.logger.error(
          `Callback query error [${callbackQuery.data}]: ${message}`,
          stack,
        );
        this.messenger.sendMessage(
          chatId,
          'Произошла ошибка, попробуйте ещё раз',
        );
      }
    });

    this.bot.on('message', async (msg) => {
      try {
        await this.chatHandlers.handlePendingMessage(msg);
      } catch (error: unknown) {
        const { message, stack } = extractError(error);
        this.logger.error(
          `Failed to handle pending chat rename: ${message}`,
          stack,
        );
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
  }

  private trackPrivateChat(msg: TelegramBot.Message) {
    if (msg.chat.type === 'private') {
      this.privateChatIds.add(msg.chat.id);
    }
    void this.chatHandlers.trackIncomingChat(msg);
  }

  private async notifyOtherPrivateChats(excludeChatId: number, text: string) {
    for (const chatId of this.privateChatIds) {
      if (chatId === excludeChatId) continue;
      this.messenger.sendMessage(chatId, text).catch((err) => {
        this.logger.warn(`Failed to notify chat ${chatId}: ${err.message}`);
      });
    }
  }

  public async sendOwnerMessage(text: string): Promise<void> {
    const ownerChatId = this.configService.get<number>(
      'telegram-bot.ownerChatId',
    );
    await this.messenger.sendHtml(ownerChatId, text);
  }

  private async separatorHandler(msg: TelegramBot.Message) {
    await this.resetHandler(msg.chat.id, msg.from?.first_name || 'Кто-то');
  }

  private async resetHandler(chatId: number, initiator: string) {
    try {
      const dirtyTasks = await this.taskService.getDirtyTasks();
      const manualEntries = await this.manualEntryService.getAllEntries();

      if (!dirtyTasks.length && !manualEntries.length) {
        await this.taskService.clearNextPlannedTask();
        this.messenger.sendMessage(chatId, 'Нет данных для сброса');
        return;
      }

      await this.taskService.resetDirtyFlags();
      await this.manualEntryService.resetEntries();
      await this.taskService.clearNextPlannedTask();

      const totalCount = dirtyTasks.length + manualEntries.length;
      this.messenger.sendMessage(
        chatId,
        `———————————————————————————————\nДанные сброшены (${totalCount} задач). Новый рабочий период начат.`,
      );

      await this.notifyOtherPrivateChats(
        chatId,
        `🔴 ${initiator} сбросил(а) данные для отчёта (${totalCount} задач). Новый период начат.`,
      );
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to reset data: ${message}`, stack);
      this.messenger.sendMessage(chatId, 'Ошибка при сбросе данных');
    }
  }
}
