import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { extractError } from 'src/common/helpers';

@Injectable()
export class TelegramMessengerService {
  public readonly bot: TelegramBot;

  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {
    this.logger = new Logger(TelegramMessengerService.name);
    this.bot = new TelegramBot(
      this.configService.get<string>(`telegram-bot.token`),
      {
        polling: true,
      },
    );
  }

  public async sendMarkdown(chatId: number, text: string): Promise<void> {
    const MAX_LENGTH = 4096;
    const chunks =
      text.length <= MAX_LENGTH ? [text] : this.splitMessage(text, MAX_LENGTH);

    for (const chunk of chunks) {
      try {
        await this.bot.sendMessage(chatId, chunk, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });
      } catch (error: unknown) {
        const { message } = extractError(error);
        this.logger.warn(
          `Markdown send failed, retrying as plain text: ${message}`,
        );
        await this.bot.sendMessage(chatId, chunk, {
          disable_web_page_preview: true,
        });
      }
    }
  }

  public async sendHtml(chatId: number, text: string): Promise<void> {
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
}
