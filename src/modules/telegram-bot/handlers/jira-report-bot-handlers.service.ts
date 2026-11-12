import { Injectable, Logger } from '@nestjs/common';
import { extractError } from 'src/common/helpers';
import {
  JiraActivityReportService,
  JiraPriorityReportService,
} from '../../jira';
import { TelegramMessengerService } from '../telegram-messenger.service';

@Injectable()
export class JiraReportBotHandlers {
  constructor(
    private readonly logger: Logger,
    private readonly messenger: TelegramMessengerService,
    private readonly jiraActivityReportService: JiraActivityReportService,
    private readonly jiraPriorityReportService: JiraPriorityReportService,
  ) {
    this.logger = new Logger(JiraReportBotHandlers.name);
  }

  public async report24Handler(chatId: number) {
    this.messenger.sendMessage(chatId, 'Загружаю данные из Jira...');
    try {
      const report =
        await this.jiraActivityReportService.generateRecentActivityReport();
      await this.messenger.sendMarkdown(chatId, report || 'Пустой ответ');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Report24 error: ${message}`, stack);
      this.messenger.sendMessage(
        chatId,
        `Ошибка при выполнении запроса: ${message}`,
      );
    }
  }

  public async priorityHandler(chatId: number) {
    this.messenger.sendMessage(chatId, 'Загружаю данные из Jira...');
    try {
      const report =
        await this.jiraPriorityReportService.generatePriorityReport();
      await this.messenger.sendHtml(chatId, report);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Priority error: ${message}`, stack);
      this.messenger.sendMessage(
        chatId,
        `Ошибка при выполнении запроса: ${message}`,
      );
    }
  }
}
