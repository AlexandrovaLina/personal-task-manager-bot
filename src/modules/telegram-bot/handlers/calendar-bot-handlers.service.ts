import { Injectable, Logger } from '@nestjs/common';
import { extractError } from 'src/common/helpers';
import { CalendarService } from '../../calendar';
import { TelegramMessengerService } from '../telegram-messenger.service';

@Injectable()
export class CalendarBotHandlers {
  constructor(
    private readonly logger: Logger,
    private readonly messenger: TelegramMessengerService,
    private readonly calendarService: CalendarService,
  ) {
    this.logger = new Logger(CalendarBotHandlers.name);
  }

  public async callsHandler(chatId: number) {
    try {
      const meetings = await this.calendarService.getTodayMeetings();
      const digest = this.calendarService.buildDigest(
        meetings,
        'Созвоны сегодня:',
      );

      await this.messenger.sendHtml(chatId, digest);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to fetch today's meetings: ${message}`, stack);
      this.messenger.bot.sendMessage(
        chatId,
        'Ошибка при получении списка созвонов',
      );
    }
  }

  public async syncCallsHandler(chatId: number) {
    try {
      this.messenger.bot.sendMessage(
        chatId,
        'Синхронизирую созвоны из календаря...',
      );
      await this.calendarService.syncMeetings();
      this.messenger.bot.sendMessage(chatId, 'Готово');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to sync calendar meetings: ${message}`, stack);
      this.messenger.bot.sendMessage(
        chatId,
        'Ошибка при синхронизации созвонов',
      );
    }
  }
}
