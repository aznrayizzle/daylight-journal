import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Star } from 'lucide-react';
import type { JournalEntry, PhotoRecord } from '../types';
import {
  entryToDateKey,
  formatTime,
  getEntryDateParts,
  toLocalDateKey,
} from '../lib/dateUtils';
import { splitEntryTitleAndPreview } from '../lib/doentry';
import { PhotoThumbnail } from './PhotoThumbnail';

interface CalendarViewProps {
  entries: JournalEntry[];
  photosByUuid: Map<string, PhotoRecord>;
  selectedUuid: string | null;
  onSelectEntry: (uuid: string) => void;
  onCreateEntryForDate: (isoDate: string) => void;
  onBlobLoaded: (uuid: string, blob: Blob) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function CalendarView({
  entries,
  photosByUuid,
  selectedUuid,
  onSelectEntry,
  onCreateEntryForDate,
  onBlobLoaded,
}: CalendarViewProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string>(
    toLocalDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const entry of entries) {
      const key = entryToDateKey(entry);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [entries]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let minYear = currentYear - 5;
    let maxYear = currentYear + 1;
    for (const entry of entries) {
      const { year } = getEntryDateParts(entry);
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
    }
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      list.push(y);
    }
    return list;
  }, [entries]);

  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setSelectedDateKey(toLocalDateKey(t.getFullYear(), t.getMonth(), t.getDate()));
  };

  const handleCreateForSelectedDate = () => {
    const [y, m, d] = selectedDateKey.split('-').map(Number);
    const current = new Date();
    const target = new Date(y, m - 1, d, current.getHours(), current.getMinutes(), 0);
    onCreateEntryForDate(target.toISOString());
  };

  const todayKey = toLocalDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEntries = entriesByDate.get(selectedDateKey) ?? [];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      {/* Month header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between gap-1 mb-3">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              aria-label="Month"
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-1.5 py-1 focus:outline-none cursor-pointer"
            >
              {MONTHS.map((label, idx) => (
                <option key={label} value={idx} className="bg-white dark:bg-slate-900">
                  {label}
                </option>
              ))}
            </select>

            <select
              aria-label="Year"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-1.5 py-1 focus:outline-none cursor-pointer"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y} className="bg-white dark:bg-slate-900">
                  {y}
                </option>
              ))}
            </select>

            <button
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={goToday}
            className="text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
          >
            Today
          </button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} />;
            const key = toLocalDateKey(viewYear, viewMonth, day);
            const count = entriesByDate.get(key)?.length ?? 0;
            const isSelected = key === selectedDateKey;
            const isToday = key === todayKey;

            return (
              <button
                key={key}
                onClick={() => setSelectedDateKey(key)}
                className={`relative h-10 rounded-lg flex flex-col items-center justify-center text-xs font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-sky-500 text-white shadow-sm'
                    : isToday
                      ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 ring-1 ring-sky-300 dark:ring-sky-700'
                      : count > 0
                        ? 'text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold'
                        : 'text-slate-400 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      isSelected ? 'bg-white' : 'bg-sky-500'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Entries for selected day */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {selectedDateKey} · {dayEntries.length}{' '}
            {dayEntries.length === 1 ? 'entry' : 'entries'}
          </p>
          <button
            onClick={handleCreateForSelectedDate}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            New entry
          </button>
        </div>

        {dayEntries.length === 0 ? (
          <div className="px-1 py-6 text-center space-y-2.5">
            <p className="text-xs text-slate-400">No entries on this date.</p>
            <button
              onClick={handleCreateForSelectedDate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Write entry for {selectedDateKey}
            </button>
          </div>
        ) : (
          dayEntries.map((entry) => {
            const { title, preview } = splitEntryTitleAndPreview(entry.entryText);
            const photo = photosByUuid.get(entry.uuid.toUpperCase());
            const isSelected = entry.uuid === selectedUuid;

            return (
              <button
                key={entry.uuid}
                onClick={() => onSelectEntry(entry.uuid)}
                className={`w-full text-left p-3 rounded-xl border flex items-start gap-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/40'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {title}
                    </span>
                    {entry.starred && (
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                    )}
                  </div>
                  {preview && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                      {preview}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">{formatTime(entry.creationDate)}</p>
                </div>
                {photo && (
                  <PhotoThumbnail
                    photo={photo}
                    onBlobLoaded={onBlobLoaded}
                    className="w-12 h-12 rounded-lg shrink-0"
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
