import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { TaskService } from '../task/task.service';
import { forEachPromise } from 'src/common/helpers';
import {
  BotCommands,
  GENERATE_TASK_REPORT_REGEX,
  GET_TASK_INFO_REGEX,
  UPDATE_TASK_COMMENTS_REGEX,
} from './constants';
import { TaskEntity } from '../task/task.entity';
import { TASK_PAGE_SIZE } from '../task/constants';
@Injectable()
export class TelegramBotService {
  private bot: TelegramBot;

  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly taskService: TaskService,
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

    this.bot.on('callback_query', async (callbackQuery) => {
      const message = callbackQuery.message;
      const chatId = message.chat.id;
      if (callbackQuery.data === 'help') {
        this.bot.sendMessage(
          chatId,
          '1. Для того, чтобы обновить комментарий к задаче, пришлите мне сообщение в формате <номер таски>: <комментарий> \n2. Для генерации отчета воспользуйтесь командой /report',
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

    await this.taskService.update(task.id, { comments: comment });
    this.bot.sendMessage(
      chatId,
      `Таска с номером ${taskNumber} успешно обновлена`,
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
