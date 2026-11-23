import { useMemo } from 'react';
import { Images } from 'lucide-react';
import type { JournalEntry, PhotoRecord } from '../types';
import { formatDayShort, formatMonthYear, getEntryDateParts } from '../lib/dateUtils';
import { splitEntryTitleAndPreview } from '../lib/doentry';
import { PhotoThumbnail } from './PhotoThumbnail';

interface PhotosViewProps {
  entries: JournalEntry[];
  photosByUuid: Map<string, PhotoRecord>;
  selectedUuid: string | null;
  onSelectEntry: (uuid: string) => void;
  onBlobLoaded: (uuid: string, blob: Blob) => void;
}

export function PhotosView({
  entries,
  photosByUuid,
  selectedUuid,
  onSelectEntry,
  onBlobLoaded,
}: PhotosViewProps) {
  const photoEntries = useMemo(
    () =>
      entries
        .map((entry) => ({
          entry,
          photo: photosByUuid.get(entry.uuid.toUpperCase()),
        }))
        .filter((item): item is { entry: JournalEntry; photo: PhotoRecord } => Boolean(item.photo)),
    [entries, photosByUuid]
  );

  const grouped = useMemo(() => {
    const groups: {
      key: string;
      label: string;
      items: { entry: JournalEntry; photo: PhotoRecord }[];
    }[] = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const item of photoEntries) {
      const { year, month } = getEntryDateParts(item.entry);
      const key = `${year}-${String(month).padStart(2, '0')}`;
      let group = map.get(key);
      if (!group) {
        group = { key, label: formatMonthYear(year, month), items: [] };
        map.set(key, group);
        groups.push(group);
      }
      group.items.push(item);
    }

    return groups;
  }, [photoEntries]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
            <Images className="w-5 h-5" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Photos</h2>
          </div>
          <span className="text-xs text-slate-400">
            {photoEntries.length} {photoEntries.length === 1 ? 'photo' : 'photos'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="py-16 px-6 text-center text-slate-400 space-y-2">
            <Images className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              No journal photos yet
            </p>
            <p className="text-xs">
              Attach a photo to any entry or sync your Google Drive photos/ folder.
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.key}>
              <div className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-100 dark:border-slate-800/80">
                {group.label}
              </div>
              <div className="p-2.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 gap-2">
                {group.items.map(({ entry, photo }) => {
                  const isSelected = entry.uuid === selectedUuid;
                  const { dayNum } = formatDayShort(entry.creationDate);
                  const { title } = splitEntryTitleAndPreview(entry.entryText);

                  return (
                    <button
                      key={entry.uuid}
                      onClick={() => onSelectEntry(entry.uuid)}
                      className={`group relative aspect-square rounded-xl overflow-hidden border transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'ring-2 ring-sky-500 border-sky-500'
                          : 'border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700'
                      }`}
                    >
                      <PhotoThumbnail
                        photo={photo}
                        onBlobLoaded={onBlobLoaded}
                        className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-2 pt-6">
                        <p className="text-[11px] font-semibold text-white truncate">{title}</p>
                        <p className="text-[10px] text-white/80">Day {dayNum}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
