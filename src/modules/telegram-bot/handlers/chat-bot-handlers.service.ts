import { Injectable, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { extractError } from 'src/common/helpers';
import { TelegramChatService } from '../telegram-chat.service';
import { TelegramMessengerService } from '../telegram-messenger.service';

@Injectable()
export class ChatBotHandlers {
  private readonly pendingRename = new Map<number, string>();

  constructor(
    private readonly logger: Logger,
    private readonly messenger: TelegramMessengerService,
    private readonly chatService: TelegramChatService,
  ) {
    this.logger = new Logger(ChatBotHandlers.name);
  }

  public async trackIncomingChat(msg: TelegramBot.Message): Promise<void> {
    try {
      await this.chatService.trackChat(
        msg.chat.id,
        msg.chat.type,
        this.buildDefaultName(msg.chat),
      );
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to track chat ${msg.chat.id}: ${message}`,
        stack,
      );
    }
  }

  public async listChatsHandler(chatId: number): Promise<void> {
    const keyboard = await this.buildChatListKeyboard();

    if (!keyboard.inline_keyboard.length) {
      await this.messenger.sendMessage(chatId, 'Известных чатов пока нет');
      return;
    }

    await this.messenger.sendMessage(
      chatId,
      '✏️ — переименовать, ✅/🚫 — разрешить/запретить боту писать в чат:',
      { reply_markup: keyboard },
    );
  }

  public async startRenameHandler(
    adminChatId: number,
    targetChatId: string,
    callbackQueryId: string,
  ): Promise<void> {
    const chat = await this.chatService.getChatById(+targetChatId);
    if (!chat) {
      await this.messenger.bot.answerCallbackQuery(callbackQueryId, {
        text: 'Чат не найден',
        show_alert: true,
      });
      return;
    }

    this.pendingRename.set(adminChatId, chat.chatId);
    await this.messenger.bot.answerCallbackQuery(callbackQueryId);
    await this.messenger.sendMessage(
      adminChatId,
      `Введите новое имя для чата «${chat.name}»:`,
    );
  }

  public async handlePendingMessage(msg: TelegramBot.Message): Promise<void> {
    const adminChatId = msg.chat.id;
    const targetChatId = this.pendingRename.get(adminChatId);
    if (!targetChatId || !msg.text) return;

    this.pendingRename.delete(adminChatId);
    const name = msg.text.trim();
    await this.chatService.renameChat(+targetChatId, name);
    await this.messenger.sendMessage(
      adminChatId,
      `Чат переименован в «${name}»`,
    );
  }

  public async toggleWriteHandler(
    targetChatId: string,
    chatId: number,
    messageId: number,
    callbackQueryId: string,
  ): Promise<void> {
    const updated = await this.chatService.toggleWriteAllowed(+targetChatId);
    if (!updated) {
      await this.messenger.bot.answerCallbackQuery(callbackQueryId, {
        text: 'Чат не найден',
        show_alert: true,
      });
      return;
    }

    await this.messenger.bot.answerCallbackQuery(callbackQueryId, {
      text: updated.isWriteAllowed
        ? 'Разрешено писать в чат'
        : 'Запрещено писать в чат',
    });

    const keyboard = await this.buildChatListKeyboard();
    await this.messenger.bot.editMessageReplyMarkup(keyboard, {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  private async buildChatListKeyboard(): Promise<TelegramBot.InlineKeyboardMarkup> {
    const chats = await this.chatService.getAllChats();

    return {
      inline_keyboard: chats.map((chat) => [
        {
          text: `✏️ ${chat.name} (${chat.chatId})`,
          callback_data: `chat_rename_${chat.chatId}`,
        },
        {
          text: chat.isWriteAllowed ? '✅' : '🚫',
          callback_data: `chat_toggle_${chat.chatId}`,
        },
      ]),
    };
  }

  private buildDefaultName(chat: TelegramBot.Chat): string {
    if (chat.title) return chat.title;

    const fullName = [chat.first_name, chat.last_name]
      .filter(Boolean)
      .join(' ');
    if (fullName) return fullName;

    if (chat.username) return `@${chat.username}`;

    return `Chat ${chat.id}`;
  }
}
