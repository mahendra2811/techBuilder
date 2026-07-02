/**
 * Business-date math (pure — unit-tested in WP-5).
 * Convention (frozen): business day = local date in Asia/Kolkata with an org EOD cutoff
 * (default 20:00). An entry made AFTER the cutoff belongs to the NEXT business date
 * (decided in the hardening punchlist WP-5).
 */
const KOLKATA = 'Asia/Kolkata';

/** Local Kolkata calendar date + minutes-since-midnight for an instant. */
export function kolkataClock(now: Date): { date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOLKATA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const hourRaw = parts['hour'] ?? '00';
  const hour = hourRaw === '24' ? 0 : Number(hourRaw); // some engines render midnight as 24
  const minute = Number(parts['minute'] ?? '00');
  const date = `${parts['year'] ?? '1970'}-${parts['month'] ?? '01'}-${parts['day'] ?? '01'}`;
  return { date, minutes: hour * 60 + minute };
}

/** The business date an entry made at `now` belongs to, given the org cutoff (e.g. '20:00'). */
export function businessDateNow(now: Date, cutoffLocalTime: string): string {
  const { date, minutes } = kolkataClock(now);
  const [h, m] = cutoffLocalTime.split(':');
  const cutoffMinutes = Number(h ?? '20') * 60 + Number(m ?? '0');
  return minutes >= cutoffMinutes ? addDays(date, 1) : date;
}

/** ISO date ± n days (UTC-safe on YYYY-MM-DD strings). */
export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
