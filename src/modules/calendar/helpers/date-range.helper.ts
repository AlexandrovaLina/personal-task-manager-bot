export function getTodayRange(offsetHours: number): { start: Date; end: Date } {
  const now = new Date();
  const shifted = new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
  const localMidnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );

  const start = new Date(localMidnightUtc - offsetHours * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

export function formatLocalTime(date: Date, offsetHours: number): string {
  const shifted = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  const hours = String(shifted.getUTCHours()).padStart(2, '0');
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}
