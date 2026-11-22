import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import type { JournalEntry, PhotoRecord } from '../types';
import {
  entryToDateKey,
  formatMonthYear,
  formatTime,
  toLocalDateKey,
} from '../lib/dateUtils';
import { splitEntryTitleAndPreview } from '../lib/doentry';
import { PhotoThumbnail } from './PhotoThumbnail';

interface CalendarViewProps {
  entries: JournalEntry[];
  photosByUuid: Map<string, PhotoRecord>;
  selectedUuid: string | null;
  onSelectEntry: (uuid: string) => void;
  onBlobLoaded: (uuid: string, blob: Blob) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView({
  entries,
  photosByUuid,
  selectedUuid,
  onSelectEntry,
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

  const todayKey = toLocalDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEntries = entriesByDate.get(selectedDateKey) ?? [];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      {/* Month header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white min-w-[140px] text-center">
              {formatMonthYear(viewYear, viewMonth)}
            </h2>
            <button
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={goToday}
            className="text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
          {selectedDateKey} · {dayEntries.length}{' '}
          {dayEntries.length === 1 ? 'entry' : 'entries'}
        </p>

        {dayEntries.length === 0 ? (
          <p className="text-xs text-slate-400 px-1 py-4">No entries on this date.</p>
        ) : (
          dayEntries.map((entry) => {
            const { title, preview } = splitEntryTitleAndPreview(entry.entryText);
            const photo = photosByUuid.get(entry.uuid);
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
