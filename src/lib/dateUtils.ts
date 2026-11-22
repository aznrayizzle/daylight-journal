import type { JournalEntry } from '../types';

export function getEntryDateParts(entry: JournalEntry): {
  year: number;
  month: number; // 0-indexed (0..11)
  day: number; // 1..31
  date: Date;
} {
  const date = new Date(entry.creationDate);
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), date: now };
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    date,
  };
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDayShort(iso: string): { dayNum: string; weekdayShort: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dayNum: '--', weekdayShort: '' };
  return {
    dayNum: String(d.getDate()),
    weekdayShort: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
  };
}

export function toLocalDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function entryToDateKey(entry: JournalEntry): string {
  const { year, month, day } = getEntryDateParts(entry);
  return toLocalDateKey(year, month, day);
}

/**
 * Converts an ISO UTC string into a `YYYY-MM-DDTHH:mm` string for `<input type="datetime-local">`.
 */
export function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Converts a `<input type="datetime-local">` value back to ISO-8601 UTC string.
 */
export function datetimeLocalToIso(localVal: string): string {
  const d = new Date(localVal);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function getOnThisDayEntries(
  entries: JournalEntry[],
  month: number,
  day: number,
  referenceYear?: number
): { entry: JournalEntry; yearsAgo: number; year: number }[] {
  const refYear = referenceYear ?? new Date().getFullYear();
  return entries
    .map((entry) => {
      const parts = getEntryDateParts(entry);
      return { entry, parts };
    })
    .filter(({ parts }) => parts.month === month && parts.day === day)
    .map(({ entry, parts }) => ({
      entry,
      year: parts.year,
      yearsAgo: refYear - parts.year,
    }))
    .sort((a, b) => b.year - a.year);
}
