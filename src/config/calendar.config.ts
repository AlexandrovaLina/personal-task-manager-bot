import { registerAs } from '@nestjs/config';

import { CalendarConfig } from './interfaces';

export default registerAs('calendar', (): CalendarConfig => {
  return {
    icsUrl: process.env.OUTLOOK_CALENDAR_ICS_URL,
    tzOffsetHours: +(process.env.CALENDAR_TZ_OFFSET_HOURS ?? 3),
  };
});
