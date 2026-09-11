import { Logger, Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigModule } from '@nestjs/config';
import { TaskModule } from '../task';
import { ScriptRunnerModule } from '../script-runner';
import { CalendarModule } from '../calendar';
import { ManualEntryModule } from '../manual-entry';
@Module({
  imports: [
    ConfigModule,
    TaskModule,
    ScriptRunnerModule,
    CalendarModule,
    ManualEntryModule,
  ],
  providers: [TelegramBotService, Logger],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
