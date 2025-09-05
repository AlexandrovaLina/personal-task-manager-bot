import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { TaskService } from './modules/task/task.service';

@Injectable()
export class AppService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly taskService: TaskService,
  ) {
    this.logger = new Logger(AppService.name);
  }

  private readonly URL = this.configService.get<string>(`app.healthUrl`);
  private readonly tmpServiceURL = 'https://larning-log-j4wm.onrender.com'

  @Cron("0 */3 * * * *") //every 3 minutes
  async handleCron() {
    try {
      const response = await firstValueFrom(this.httpService.get(this.URL));
      const tmpReq = await firstValueFrom(this.httpService.get(this.tmpServiceURL))
      this.logger.debug(
        '[MAINTAIN SERVER JOB]: Request successful:',
        response.data,
      );
      this.logger.debug(
        '[MAINTAIN TMP-SERVER]: Request successful:',
        tmpReq?.data,
      );
    } catch (error) {
      this.logger.error('[MAINTAIN SERVER JOB] Error during request:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async handleTaskUpdatesCron() {
    try {
      await this.taskService.syncTaskData();
      this.logger.debug('[SYNC TASK JOB]: Sync successful:');
    } catch (error) {
      this.logger.error('[SYNC TASK JOB] Error during sync:', error);
    }
  }
}
