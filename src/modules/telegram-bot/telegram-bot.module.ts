import { Logger, Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskModule } from '../task';
import { JiraModule } from '../jira';
import { CalendarModule } from '../calendar';
import { ManualEntryModule } from '../manual-entry';
import { ReportModule } from '../report';
import { TelegramMessengerService } from './telegram-messenger.service';
import { TelegramChatService } from './telegram-chat.service';
import { TelegramChatEntity } from './telegram-chat.entity';
import {
  TaskBotHandlers,
  ManualEntryBotHandlers,
  CalendarBotHandlers,
  JiraReportBotHandlers,
  ChatBotHandlers,
} from './handlers';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TelegramChatEntity]),
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
    TelegramChatService,
    TaskBotHandlers,
    ManualEntryBotHandlers,
    CalendarBotHandlers,
    JiraReportBotHandlers,
    ChatBotHandlers,
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
