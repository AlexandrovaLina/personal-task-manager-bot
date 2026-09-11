import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { extractError } from 'src/common/helpers';
import { TelegramChatEntity } from './telegram-chat.entity';

@Injectable()
export class TelegramChatService {
  constructor(
    private readonly logger: Logger,
    private readonly datasource: DataSource,
  ) {
    this.logger = new Logger(TelegramChatService.name);
  }

  public async trackChat(
    chatId: number,
    chatType: string,
    defaultName: string,
  ): Promise<void> {
    const repo = this.datasource.getRepository(TelegramChatEntity);
    const id = String(chatId);

    const existing = await repo.findOneBy({ chatId: id });
    if (existing) {
      if (existing.chatType !== chatType) {
        await repo.update({ chatId: id }, { chatType });
      }
      return;
    }

    try {
      await repo.insert({
        chatId: id,
        chatType,
        name: defaultName,
        isWriteAllowed: true,
      });
    } catch (error: unknown) {
      const { message } = extractError(error);
      this.logger.warn(`Failed to track chat ${id}: ${message}`);
    }
  }

  public async getAllChats(): Promise<TelegramChatEntity[]> {
    const repo = this.datasource.getRepository(TelegramChatEntity);
    return repo.find({ order: { name: 'ASC' } });
  }

  public async getChatById(chatId: number): Promise<TelegramChatEntity | null> {
    const repo = this.datasource.getRepository(TelegramChatEntity);
    return repo.findOneBy({ chatId: String(chatId) });
  }

  public async isWriteAllowed(chatId: number): Promise<boolean> {
    const chat = await this.getChatById(chatId);
    return chat?.isWriteAllowed ?? true;
  }

  public async renameChat(chatId: number, name: string): Promise<void> {
    const repo = this.datasource.getRepository(TelegramChatEntity);
    await repo.update({ chatId: String(chatId) }, { name });
  }

  public async toggleWriteAllowed(
    chatId: number,
  ): Promise<TelegramChatEntity | null> {
    const chat = await this.getChatById(chatId);
    if (!chat) return null;

    const repo = this.datasource.getRepository(TelegramChatEntity);
    const isWriteAllowed = !chat.isWriteAllowed;
    await repo.update({ chatId: chat.chatId }, { isWriteAllowed });

    return { ...chat, isWriteAllowed };
  }
}
