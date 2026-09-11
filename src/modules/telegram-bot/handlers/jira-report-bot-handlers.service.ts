import { Injectable, Logger } from '@nestjs/common';
import { extractError } from 'src/common/helpers';
import { JiraActivityReportService } from '../../jira';
import { TelegramMessengerService } from '../telegram-messenger.service';

@Injectable()
export class JiraReportBotHandlers {
  constructor(
    private readonly logger: Logger,
    private readonly messenger: TelegramMessengerService,
    private readonly jiraActivityReportService: JiraActivityReportService,
  ) {
    this.logger = new Logger(JiraReportBotHandlers.name);
  }

  public async report24Handler(chatId: number) {
    this.messenger.bot.sendMessage(chatId, 'Загружаю данные из Jira...');
    try {
      const report =
        await this.jiraActivityReportService.generateRecentActivityReport();
      await this.messenger.sendMarkdown(chatId, report || 'Пустой ответ');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Report24 error: ${message}`, stack);
      this.messenger.bot.sendMessage(
        chatId,
        `Ошибка при выполнении запроса: ${message}`,
      );
    }
  }
}
