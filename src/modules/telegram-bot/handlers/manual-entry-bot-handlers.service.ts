import { Injectable, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { extractError } from 'src/common/helpers';
import { ManualEntryService } from '../../manual-entry';
import { ReportBuilderService } from '../../report';
import { TelegramMessengerService } from '../telegram-messenger.service';
import { MANUAL_ENTRY_REGEX } from '../constants';

@Injectable()
export class ManualEntryBotHandlers {
  constructor(
    private readonly logger: Logger,
    private readonly messenger: TelegramMessengerService,
    private readonly manualEntryService: ManualEntryService,
    private readonly reportBuilderService: ReportBuilderService,
  ) {
    this.logger = new Logger(ManualEntryBotHandlers.name);
  }

  public async manualEntryHandler(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    try {
      const match = msg.text.match(MANUAL_ENTRY_REGEX);
      const key = match[1].toUpperCase();
      const comment = match[2]?.trim();

      if (!comment) {
        this.messenger.bot.sendMessage(
          chatId,
          'Комментарий не может быть пустым',
        );
        return;
      }

      await this.manualEntryService.upsertEntry(key, comment);
      this.messenger.bot.sendMessage(chatId, `Запись ${key} сохранена`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '➕ Добавить в текущие задачи',
                callback_data: `manual_current_${key}`,
              },
            ],
          ],
        },
      });
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to save manual entry: ${message}`, stack);
      this.messenger.bot.sendMessage(chatId, 'Ошибка при сохранении записи');
    }
  }

  public async manualEntryMarkCurrentHandler(
    key: string,
    chatId: number,
    messageId: number,
    callbackQueryId: string,
  ) {
    const entry = await this.manualEntryService.setCurrent(key);
    if (!entry) {
      this.messenger.bot.answerCallbackQuery(callbackQueryId, {
        text: 'Запись не найдена',
        show_alert: true,
      });
      return;
    }

    this.messenger.bot.answerCallbackQuery(callbackQueryId, {
      text: `${key} добавлена в текущие задачи`,
    });
    this.messenger.bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: messageId },
    );
  }

  public async manualEntryInfoHandler(messageText: string, chatId: number) {
    try {
      const key = messageText.toUpperCase();
      const entry = await this.manualEntryService.getByKey(key);

      if (!entry) {
        this.messenger.bot.sendMessage(
          chatId,
          `❗️❗️❗️ Запись по ключу ${key} не найдена ❗️❗️❗️`,
        );
        return;
      }

      const reply = this.reportBuilderService.buildManualEntryReport(entry);
      await this.messenger.sendHtml(chatId, reply);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to get manual entry [${messageText}]: ${message}`,
        stack,
      );
      this.messenger.bot.sendMessage(chatId, 'Ошибка при получении записи');
    }
  }
}
