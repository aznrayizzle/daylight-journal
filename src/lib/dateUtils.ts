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

// Cached Intl.DateTimeFormat instances avoid expensive per-call formatter construction in Safari/Chrome
const monthYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});
const weekdayShortFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
});
const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatMonthYear(year: number, month: number): string {
  return monthYearFormatter.format(new Date(year, month, 1));
}

export function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fullDateFormatter.format(d);
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return shortDateFormatter.format(d);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return timeFormatter.format(d);
}

export function formatDayShort(iso: string): { dayNum: string; weekdayShort: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dayNum: '--', weekdayShort: '' };
  return {
    dayNum: String(d.getDate()),
    weekdayShort: weekdayShortFormatter.format(d).toUpperCase(),
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

/**
 * Counts words in an entry, ignoring pure Markdown punctuation tokens.
 */
export function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned
    .split(/\s+/)
    .filter((token) => /[a-zA-Z0-9\u00C0-\u024F\u4E00-\u9FFF]/.test(token)).length;
}

/**
 * Computes the current consecutive-day journaling streak (counting today or yesterday as active).
 */
export function computeWritingStreak(entries: JournalEntry[], now: Date = new Date()): number {
  if (entries.length === 0) return 0;
  const dateSet = new Set<string>();
  for (const e of entries) {
    dateSet.add(entryToDateKey(e));
  }

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = toLocalDateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());

  // If no entry yet today, check if yesterday keeps the streak alive
  if (!dateSet.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
    const yesterdayKey = toLocalDateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    if (!dateSet.has(yesterdayKey)) return 0;
  }

  let streak = 0;
  while (true) {
    const key = toLocalDateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    if (!dateSet.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
