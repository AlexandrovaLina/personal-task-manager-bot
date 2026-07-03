import { Logger, Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigModule } from '@nestjs/config';
import { TaskModule } from '../task/task.module';
import { ScriptRunnerModule } from '../script-runner';
import { CalendarModule } from '../calendar/calendar.module';
@Module({
  imports: [ConfigModule, TaskModule, ScriptRunnerModule, CalendarModule],
  providers: [TelegramBotService, Logger],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
