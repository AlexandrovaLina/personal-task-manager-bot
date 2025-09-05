import { Logger, Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigModule } from '@nestjs/config';
import { TaskModule } from '../task/task.module';
@Module({
  imports: [ConfigModule, TaskModule],
  providers: [TelegramBotService, Logger],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
