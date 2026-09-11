import { Logger, Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigModule } from '@nestjs/config';
import { TaskModule } from '../task';
import { ScriptRunnerModule } from '../script-runner';
import { CalendarModule } from '../calendar';
import { ManualEntryModule } from '../manual-entry';
import { ReportModule } from '../report';
import { TelegramMessengerService } from './telegram-messenger.service';
import {
  TaskBotHandlers,
  ManualEntryBotHandlers,
  CalendarBotHandlers,
} from './handlers';

@Module({
  imports: [
    ConfigModule,
    TaskModule,
    ScriptRunnerModule,
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
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
