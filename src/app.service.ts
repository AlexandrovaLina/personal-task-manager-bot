import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { TaskService } from './modules/task/task.service';
import { CalendarService } from './modules/calendar/calendar.service';
import { TelegramBotService } from './modules/telegram-bot';
import { extractError } from './common/helpers';

@Injectable()
export class AppService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly taskService: TaskService,
    private readonly calendarService: CalendarService,
    private readonly telegramBotService: TelegramBotService,
  ) {
    this.logger = new Logger(AppService.name);
  }

  private readonly URL = this.configService.get<string>(`app.healthUrl`);
  private readonly tmpServiceURL = 'https://larning-log-j4wm.onrender.com';

  @Cron('0 */3 * * * *') //every 3 minutes
  async handleCron() {
    try {
      const response = await firstValueFrom(this.httpService.get(this.URL));
      const tmpReq = await firstValueFrom(
        this.httpService.get(this.tmpServiceURL),
      );
      this.logger.debug(`[MAINTAIN SERVER JOB]: ${response.status} OK`);
      this.logger.debug(`[MAINTAIN TMP-SERVER]: ${tmpReq?.status} OK`);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `[MAINTAIN SERVER JOB] Error during request: ${message}`,
        stack,
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async handleTaskUpdatesCron() {
    try {
      await this.taskService.syncTaskData();
      this.logger.debug('[SYNC TASK JOB]: Sync successful:');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`[SYNC TASK JOB] Error during sync: ${message}`, stack);
    }
  }

  @Cron('0 0 10 * * 1-5', { timeZone: 'Europe/Moscow' })
  async handleMorningMeetingsDigestCron() {
    try {
      await this.calendarService.syncMeetings();
      const meetings = await this.calendarService.getTodayMeetings();
      const digest = this.calendarService.buildDigest(
        meetings,
        'Доброе утро, созвоны сегодня:',
      );
      await this.telegramBotService.sendOwnerMessage(digest);
      this.logger.debug('[MEETINGS DIGEST JOB]: Sent successfully');
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `[MEETINGS DIGEST JOB] Error during digest: ${message}`,
        stack,
      );
    }
  }

  @Cron('0 */30 * * * 1-5', { timeZone: 'Europe/Moscow' })
  async handleMeetingsSyncCron() {
    try {
      const { changed, cancelled } = await this.calendarService.syncMeetings();
      if (!changed.length && !cancelled.length) return;
      if (this.isQuietHoursMsk()) return;

      const meetings = await this.calendarService.getTodayMeetings();
      const digest = this.calendarService.buildDigest(
        meetings,
        '⚠️ Изменения в расписании созвонов на сегодня:',
      );
      await this.telegramBotService.sendOwnerMessage(digest);
      this.logger.debug(
        `[MEETINGS SYNC JOB]: ${changed.length} changed, ${cancelled.length} cancelled`,
      );
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `[MEETINGS SYNC JOB] Error during sync: ${message}`,
        stack,
      );
    }
  }

  private isQuietHoursMsk(): boolean {
    const mskHour = (new Date().getUTCHours() + 3) % 24;
    return mskHour >= 20 || mskHour < 9;
  }
}
