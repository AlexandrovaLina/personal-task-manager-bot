import { Logger, Module } from '@nestjs/common';
import { HealthController } from './modules/health';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramBotModule } from './modules/telegram-bot/telegram-bot.module';
import { JiraModule } from './modules/jira/jira.module';
import telegramConfig from './config/telegram.config';
import jiraConfig from './config/jira.config';
import calendarConfig from './config/calendar.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { TaskModule } from './modules/task/task.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import dbConfig from 'db/config/db-config';
import appConfig from './config/app.config';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { LoggerModule } from 'nestjs-pino';
import { AppService } from './app.service';
import { pinoPrettyConfig } from './config/pino-pretty.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        `.env`,
      ],
      isGlobal: true,
      cache: true,
      load: [telegramConfig, jiraConfig, dbConfig, appConfig, calendarConfig],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport: pinoPrettyConfig,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<{ database: DataSourceOptions }, true>,
      ) => configService.get('database'),
    }),
    ScheduleModule.forRoot(),
    HttpModule,
    TelegramBotModule,
    JiraModule,
    TaskModule,
    CalendarModule,
  ],
  providers: [AppService, Logger],
  controllers: [HealthController],
})
export class AppModule {}
