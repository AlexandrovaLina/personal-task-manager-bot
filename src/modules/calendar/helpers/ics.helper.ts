import * as ical from 'node-ical';
import { createHash } from 'crypto';

export interface ParsedMeeting {
  externalId: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  joinUrl?: string;
  location?: string;
  contentHash: string;
}

const DIRECT_JOIN_URL_REGEX =
  /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s>"]+/;
const SAFELINKS_URL_PARAM_REGEX =
  /safelinks\.protection\.outlook\.com\/[^\s>"]*?[?&]url=([^&\s>"]+)/gi;

function getParamValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (
    typeof value === 'object' &&
    'val' in (value as Record<string, unknown>)
  ) {
    return String((value as { val: unknown }).val);
  }
  return String(value);
}

function findJoinUrlInText(text: string): string | undefined {
  const direct = text.match(DIRECT_JOIN_URL_REGEX)?.[0];
  if (direct) return direct;

  for (const match of text.matchAll(SAFELINKS_URL_PARAM_REGEX)) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch {
      continue;
    }
    if (decoded.startsWith('https://teams.microsoft.com/l/meetup-join/')) {
      return decoded;
    }
  }

  return undefined;
}

const CANCELLED_SUBJECT_REGEX = /^canceled:/i;

function isCancelledEvent(event: ical.VEvent): boolean {
  if (event.status === 'CANCELLED') return true;

  const subject = getParamValue(event.summary);
  return subject ? CANCELLED_SUBJECT_REGEX.test(subject) : false;
}

function extractJoinUrl(event: ical.VEvent): string | undefined {
  const description = getParamValue(event.description);
  const location = getParamValue(event.location);

  return (
    (description && findJoinUrlInText(description)) ??
    (location && findJoinUrlInText(location))
  );
}

function buildContentHash(
  subject: string,
  startAt: Date,
  endAt: Date,
  joinUrl?: string,
  location?: string,
): string {
  return createHash('sha1')
    .update(
      [
        subject,
        startAt.toISOString(),
        endAt.toISOString(),
        joinUrl ?? '',
        location ?? '',
      ].join('|'),
    )
    .digest('hex');
}

function toParsedMeeting(
  uid: string,
  start: Date,
  end: Date,
  event: ical.VEvent,
): ParsedMeeting {
  const subject = getParamValue(event.summary) ?? 'Без названия';
  const joinUrl = extractJoinUrl(event);
  const location = getParamValue(event.location);

  return {
    externalId: `${uid}:${start.toISOString()}`,
    subject,
    startAt: start,
    endAt: end,
    joinUrl,
    location,
    contentHash: buildContentHash(subject, start, end, joinUrl, location),
  };
}

export async function fetchTodayMeetings(
  icsUrl: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<ParsedMeeting[]> {
  const data = await ical.async.fromURL(icsUrl);
  const meetings: ParsedMeeting[] = [];

  for (const component of Object.values(data)) {
    if (!component || component.type !== 'VEVENT') continue;
    const event = component as ical.VEvent;

    if (event.rrule) {
      const instances = ical.expandRecurringEvent(event, {
        from: dayStart,
        to: dayEnd,
      });
      for (const instance of instances) {
        if (isCancelledEvent(instance.event)) continue;

        meetings.push(
          toParsedMeeting(
            event.uid,
            instance.start,
            instance.end,
            instance.event,
          ),
        );
      }
      continue;
    }

    if (!event.start || !event.end) continue;
    if (event.start >= dayEnd || event.end <= dayStart) continue;
    if (isCancelledEvent(event)) continue;

    meetings.push(toParsedMeeting(event.uid, event.start, event.end, event));
  }

  return meetings.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
