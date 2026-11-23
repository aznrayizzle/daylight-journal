import { useEffect, useMemo, useRef, useState } from 'react';
import { CloudOff, History, Search, Star, Tag, X } from 'lucide-react';
import type { JournalEntry, PhotoRecord } from '../types';
import { splitEntryTitleAndPreview } from '../lib/doentry';
import {
  formatDayShort,
  formatMonthYear,
  formatTime,
  getEntryDateParts,
} from '../lib/dateUtils';
import { HighlightText } from './HighlightText';
import { PhotoThumbnail } from './PhotoThumbnail';

const PAGE_SIZE = 80;

interface TimelineListProps {
  entries: JournalEntry[];
  photosByUuid: Map<string, PhotoRecord>;
  selectedUuid: string | null;
  onSelectEntry: (uuid: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  selectedTag: string | null;
  onSelectTag?: (tag: string | null) => void;
  onClearTag: () => void;
  tagCounts?: [string, number][];
  favoritesOnly: boolean;
  onThisDayPastCount: number;
  onOpenOnThisDay: () => void;
  onBlobLoaded: (uuid: string, blob: Blob) => void;
}

export function TimelineList({
  entries,
  photosByUuid,
  selectedUuid,
  onSelectEntry,
  searchQuery,
  onSearchChange,
  searchInputRef,
  selectedTag,
  onSelectTag,
  onClearTag,
  tagCounts = [],
  favoritesOnly,
  onThisDayPastCount,
  onOpenOnThisDay,
  onBlobLoaded,
}: TimelineListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Reset pagination when filter/search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedTag, favoritesOnly]);

  // Progressive rendering via IntersectionObserver for large journals
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visibleCount >= entries.length) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (obsEntries) => {
        if (obsEntries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(entries.length, c + PAGE_SIZE));
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, entries.length]);

  const visibleEntries = useMemo(
    () => entries.slice(0, visibleCount),
    [entries, visibleCount]
  );

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: JournalEntry[] }[] = [];
    const map = new Map<string, { key: string; label: string; items: JournalEntry[] }>();

    for (const entry of visibleEntries) {
      const { year, month } = getEntryDateParts(entry);
      const key = `${year}-${String(month).padStart(2, '0')}`;
      let group = map.get(key);
      if (!group) {
        group = { key, label: formatMonthYear(year, month), items: [] };
        map.set(key, group);
        groups.push(group);
      }
      group.items.push(entry);
    }

    return groups;
  }, [visibleEntries]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      {/* Search header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search entries, tags, places… (⌘K)"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-900 border border-transparent focus:border-sky-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Mobile tag chip bar (since desktop sidebar is hidden on small screens) */}
        {tagCounts.length > 0 && onSelectTag && (
          <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {tagCounts.slice(0, 20).map(([tag, count]) => {
              const active = selectedTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => onSelectTag(active ? null : tag)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  #{tag}
                  <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {(selectedTag || favoritesOnly || searchQuery.trim()) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {favoritesOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-medium">
                <Star className="w-3 h-3 fill-current" />
                Favorites
              </span>
            )}
            {selectedTag && (
              <button
                onClick={onClearTag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 font-medium hover:bg-sky-200 dark:hover:bg-sky-900/60 cursor-pointer"
              >
                <Tag className="w-3 h-3" />
                {selectedTag}
                <X className="w-3 h-3" />
              </button>
            )}
            <span className="text-slate-400 ml-auto">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {/* On This Day callout banner on default timeline */}
        {!searchQuery.trim() && !selectedTag && !favoritesOnly && onThisDayPastCount > 0 && (
          <button
            onClick={onOpenOnThisDay}
            className="w-full text-left px-4 py-3 bg-gradient-to-r from-amber-50 to-sky-50 dark:from-amber-950/30 dark:to-sky-950/30 border-b border-slate-200 dark:border-slate-800 hover:brightness-95 transition cursor-pointer flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                On This Day
              </p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {onThisDayPastCount} {onThisDayPastCount === 1 ? 'memory' : 'memories'} from past years
              </p>
            </div>
          </button>
        )}

        {grouped.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              No matching entries
            </p>
            <p className="text-xs">
              {searchQuery
                ? 'Try a different word or clear your search filter.'
                : 'Create a new entry or connect Google Drive in Settings.'}
            </p>
          </div>
        ) : (
          <>
            {grouped.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-100 dark:border-slate-800/80">
                  {group.label}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {group.items.map((entry) => {
                    const { dayNum, weekdayShort } = formatDayShort(entry.creationDate);
                    const { title, preview } = splitEntryTitleAndPreview(entry.entryText);
                    const isSelected = entry.uuid === selectedUuid;
                    const photo = photosByUuid.get(entry.uuid.toUpperCase());

                    return (
                      <button
                        key={entry.uuid}
                        onClick={() => onSelectEntry(entry.uuid)}
                        className={`w-full text-left px-3.5 py-3 flex items-start gap-3 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-sky-50 dark:bg-sky-950/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                        }`}
                      >
                        {/* Day One date badge */}
                        <div className="w-10 shrink-0 text-center pt-0.5">
                          <div className="text-[10px] font-semibold tracking-wider text-slate-400">
                            {weekdayShort}
                          </div>
                          <div
                            className={`text-xl font-bold leading-tight ${
                              isSelected
                                ? 'text-sky-600 dark:text-sky-400'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {dayNum}
                          </div>
                        </div>

                        {/* Text content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              <HighlightText text={title} query={searchQuery} />
                            </h3>
                            {entry.starred && (
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                            )}
                            {entry.pendingSync && (
                              <span title="Pending Drive sync">
                                <CloudOff className="w-3 h-3 text-amber-500 shrink-0" />
                              </span>
                            )}
                          </div>
                          {preview && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                              <HighlightText text={preview} query={searchQuery} />
                            </p>
                          )}
                          <div className="flex items-center flex-wrap gap-1.5 mt-1.5 text-[11px] text-slate-400">
                            <span>{formatTime(entry.creationDate)}</span>
                            {entry.location?.locality && (
                              <span className="truncate max-w-[110px]">
                                · {entry.location.locality}
                              </span>
                            )}
                            {entry.tags.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                              >
                                #{t}
                              </span>
                            ))}
                            {entry.tags.length > 2 && <span>+{entry.tags.length - 2}</span>}
                          </div>
                        </div>

                        {/* Optional photo thumbnail */}
                        {photo && (
                          <PhotoThumbnail
                            photo={photo}
                            onBlobLoaded={onBlobLoaded}
                            className="w-14 h-14 rounded-lg shrink-0 border border-slate-200 dark:border-slate-800"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {visibleCount < entries.length && (
              <div ref={loadMoreRef} className="p-4 text-center">
                <button
                  onClick={() => setVisibleCount((c) => Math.min(entries.length, c + PAGE_SIZE))}
                  className="text-xs font-medium px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Show more ({entries.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
