import { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, History, Star } from 'lucide-react';
import type { JournalEntry, PhotoRecord } from '../types';
import { formatTime, getOnThisDayEntries } from '../lib/dateUtils';
import { splitEntryTitleAndPreview } from '../lib/doentry';
import { PhotoThumbnail } from './PhotoThumbnail';

interface OnThisDayViewProps {
  entries: JournalEntry[];
  photosByUuid: Map<string, PhotoRecord>;
  selectedUuid: string | null;
  onSelectEntry: (uuid: string) => void;
  onBlobLoaded: (uuid: string, blob: Blob) => void;
}

export function OnThisDayView({
  entries,
  photosByUuid,
  selectedUuid,
  onSelectEntry,
  onBlobLoaded,
}: OnThisDayViewProps) {
  const [targetDate, setTargetDate] = useState(() => new Date());

  const shiftDay = (delta: number) => {
    setTargetDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return next;
    });
  };

  const today = new Date();
  const isToday =
    targetDate.getMonth() === today.getMonth() && targetDate.getDate() === today.getDate();

  const matches = useMemo(
    () =>
      getOnThisDayEntries(
        entries,
        targetDate.getMonth(),
        targetDate.getDate(),
        today.getFullYear()
      ),
    [entries, targetDate]
  );

  const headingLabel = targetDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-gradient-to-b from-amber-50/70 to-transparent dark:from-amber-950/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <History className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">On This Day</span>
          </div>
          {!isToday && (
            <button
              onClick={() => setTargetDate(new Date())}
              className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Back to Today
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => shiftDay(-1)}
            aria-label="Previous day"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{headingLabel}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {matches.length} {matches.length === 1 ? 'entry' : 'entries'} across all years
            </p>
          </div>

          <button
            onClick={() => shiftDay(1)}
            aria-label="Next day"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Matches */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {matches.length === 0 ? (
          <div className="py-12 px-6 text-center text-slate-400 space-y-2">
            <Calendar className="w-8 h-8 mx-auto opacity-50" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              No entries written on {headingLabel}
            </p>
            <p className="text-xs">
              Use the arrows above to browse nearby dates from past years.
            </p>
          </div>
        ) : (
          matches.map(({ entry, year, yearsAgo }) => {
            const { title, preview } = splitEntryTitleAndPreview(entry.entryText);
            const photo = photosByUuid.get(entry.uuid.toUpperCase());
            const isSelected = entry.uuid === selectedUuid;

            const badgeText =
              yearsAgo === 0
                ? `This Year · ${year}`
                : yearsAgo === 1
                  ? `1 Year Ago · ${year}`
                  : yearsAgo > 1
                    ? `${yearsAgo} Years Ago · ${year}`
                    : `${year}`;

            return (
              <button
                key={entry.uuid}
                onClick={() => onSelectEntry(entry.uuid)}
                className={`w-full text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-sky-400 bg-sky-50/70 dark:bg-sky-950/40 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      yearsAgo > 0
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                        : 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300'
                    }`}
                  >
                    {badgeText}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    {entry.starred && (
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    )}
                    <span>{formatTime(entry.creationDate)}</span>
                  </div>
                </div>

                {photo && (
                  <PhotoThumbnail
                    photo={photo}
                    fit="contain"
                    onBlobLoaded={onBlobLoaded}
                    className="w-full max-h-48 bg-slate-50 dark:bg-slate-900/60 rounded-lg mb-2.5 border border-slate-200 dark:border-slate-800"
                  />
                )}

                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {title}
                </h3>
                {preview && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 mt-1 leading-relaxed">
                    {preview}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
