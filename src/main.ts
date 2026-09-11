import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { TelegramBotService } from './modules/telegram-bot';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  await app.listen(configService.get<number>('app.port'));

  const telegramService = app.get(TelegramBotService);
  telegramService.initBot();
}
bootstrap();
