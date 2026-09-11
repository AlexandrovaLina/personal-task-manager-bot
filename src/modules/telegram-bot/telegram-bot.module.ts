import { Logger, Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigModule } from '@nestjs/config';
import { TaskModule } from '../task';
import { JiraModule } from '../jira';
import { CalendarModule } from '../calendar';
import { ManualEntryModule } from '../manual-entry';
import { ReportModule } from '../report';
import { TelegramMessengerService } from './telegram-messenger.service';
import {
  TaskBotHandlers,
  ManualEntryBotHandlers,
  CalendarBotHandlers,
  JiraReportBotHandlers,
} from './handlers';

@Module({
  imports: [
    ConfigModule,
    TaskModule,
    JiraModule,
    CalendarModule,
    ManualEntryModule,
    ReportModule,
  ],
  providers: [
    TelegramBotService,
    Logger,
    TelegramMessengerService,
    TaskBotHandlers,
    ManualEntryBotHandlers,
    CalendarBotHandlers,
    JiraReportBotHandlers,
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
