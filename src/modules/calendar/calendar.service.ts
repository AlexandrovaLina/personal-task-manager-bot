import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Between, DataSource, IsNull } from 'typeorm';
import { MeetingEntity } from './meeting.entity';
import { fetchTodayMeetings, getTodayRange, formatLocalTime } from './helpers';
import { extractError } from 'src/common/helpers';
import { escapeHtml } from '../telegram-bot/helpers';

export interface SyncMeetingsResult {
  changed: MeetingEntity[];
  cancelled: MeetingEntity[];
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly logger: Logger,
    private readonly datasource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.logger = new Logger(CalendarService.name);
  }

  private readonly icsUrl = this.configService.get<string>('calendar.icsUrl');
  private readonly tzOffsetHours = this.configService.get<number>(
    'calendar.tzOffsetHours',
  );

  public async syncMeetings(): Promise<SyncMeetingsResult> {
    const meetingRepository = this.datasource.getRepository(MeetingEntity);
    const { start, end } = getTodayRange(this.tzOffsetHours);

    let parsed: Awaited<ReturnType<typeof fetchTodayMeetings>>;
    try {
      parsed = await fetchTodayMeetings(this.icsUrl, start, end);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(`Failed to fetch calendar feed: ${message}`, stack);
      throw error;
    }

    const existing = await meetingRepository.find({
      where: { startAt: Between(start, end), deletedAt: IsNull() },
    });
    const remaining = new Map(existing.map((m) => [m.externalId, m]));

    const changed: MeetingEntity[] = [];
    for (const meeting of parsed) {
      const prior = remaining.get(meeting.externalId);
      remaining.delete(meeting.externalId);

      if (prior && prior.contentHash === meeting.contentHash) continue;

      const entity = meetingRepository.create({ ...meeting, id: prior?.id });
      changed.push(await meetingRepository.save(entity));
    }

    const cancelled = [...remaining.values()];
    if (cancelled.length) {
      await meetingRepository.softDelete(cancelled.map((m) => m.id));
    }

    return { changed, cancelled };
  }

  public async getTodayMeetings(): Promise<MeetingEntity[]> {
    const meetingRepository = this.datasource.getRepository(MeetingEntity);
    const { start, end } = getTodayRange(this.tzOffsetHours);

    return meetingRepository.find({
      where: { startAt: Between(start, end), deletedAt: IsNull() },
      order: { startAt: 'ASC' },
    });
  }

  public buildDigest(meetings: MeetingEntity[], title: string): string {
    if (!meetings.length) return `${title}\n\nСегодня созвонов нет`;

    const lines = meetings.map((meeting) => {
      const time = `${formatLocalTime(meeting.startAt, this.tzOffsetHours)} - ${formatLocalTime(meeting.endAt, this.tzOffsetHours)}`;
      const subject = escapeHtml(meeting.subject);
      const link = meeting.joinUrl ? `\n${meeting.joinUrl}` : '';

      return `📅 ${subject}\n${time}${link}`;
    });

    return `${title}\n\n${lines.join('\n\n')}`;
  }
}
