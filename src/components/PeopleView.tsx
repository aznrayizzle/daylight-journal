import { memo, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  EyeOff,
  Heart,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import type { JournalEntry, PersonProfile, PhotoRecord } from '../types';
import { formatShortDate } from '../lib/dateUtils';
import { splitEntryTitleAndPreview } from '../lib/doentry';
import { buildPersonHighlightReel, computePersonStats } from '../lib/peopleMilestones';
import { HighlightText } from './HighlightText';
import { PhotoThumbnail } from './PhotoThumbnail';

interface PeopleViewProps {
  entries: JournalEntry[];
  photosByUuid: Map<string, PhotoRecord>;
  people: PersonProfile[];
  selectedUuid: string | null;
  onSelectEntry: (uuid: string) => void;
  onUpdatePeople: (next: PersonProfile[]) => Promise<void>;
}

const ACCENT_STYLES: Record<
  PersonProfile['accent'],
  { pill: string; dot: string; badge: string; bar: string }
> = {
  rose: {
    pill: 'bg-rose-500 text-white shadow-xs',
    dot: 'bg-rose-500 ring-rose-200 dark:ring-rose-950',
    badge: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-400 dark:bg-rose-500',
  },
  sky: {
    pill: 'bg-sky-500 text-white shadow-xs',
    dot: 'bg-sky-500 ring-sky-200 dark:ring-sky-950',
    badge: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
    bar: 'bg-sky-400 dark:bg-sky-500',
  },
  amber: {
    pill: 'bg-amber-500 text-white shadow-xs',
    dot: 'bg-amber-500 ring-amber-200 dark:ring-amber-950',
    badge: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
    bar: 'bg-amber-400 dark:bg-amber-500',
  },
  emerald: {
    pill: 'bg-emerald-500 text-white shadow-xs',
    dot: 'bg-emerald-500 ring-emerald-200 dark:ring-emerald-950',
    badge: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-400 dark:bg-emerald-500',
  },
  violet: {
    pill: 'bg-violet-500 text-white shadow-xs',
    dot: 'bg-violet-500 ring-violet-200 dark:ring-violet-950',
    badge: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-400 dark:bg-violet-500',
  },
};

const ACCENT_ORDER: PersonProfile['accent'][] = ['rose', 'sky', 'amber', 'emerald', 'violet'];

export const PeopleView = memo(function PeopleView({
  entries,
  photosByUuid,
  people,
  selectedUuid,
  onSelectEntry,
  onUpdatePeople,
}: PeopleViewProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string>(people[0]?.id ?? 'lucy');
  const [tab, setTab] = useState<'highlights' | 'all'>('highlights');
  const [oldestFirst, setOldestFirst] = useState(true);
  const [addingPerson, setAddingPerson] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [newRole, setNewRole] = useState<PersonProfile['role']>('family');
  const [pinEditingUuid, setPinEditingUuid] = useState<string | null>(null);
  const [pinLabelInput, setPinLabelInput] = useState('');

  const activePerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId) ?? people[0],
    [people, selectedPersonId]
  );

  const { mentions, milestones } = useMemo(() => {
    if (!activePerson) return { mentions: [], milestones: [] };
    return buildPersonHighlightReel(entries, activePerson);
  }, [entries, activePerson]);

  const stats = useMemo(
    () => computePersonStats(mentions, photosByUuid),
    [mentions, photosByUuid]
  );

  const sortedMilestones = useMemo(() => {
    const copy = [...milestones];
    copy.sort((a, b) =>
      oldestFirst
        ? a.entry.creationDate.localeCompare(b.entry.creationDate)
        : b.entry.creationDate.localeCompare(a.entry.creationDate)
    );
    return copy;
  }, [milestones, oldestFirst]);

  const sortedMentions = useMemo(() => {
    const copy = [...mentions];
    copy.sort((a, b) =>
      oldestFirst
        ? a.entry.creationDate.localeCompare(b.entry.creationDate)
        : b.entry.creationDate.localeCompare(a.entry.creationDate)
    );
    return copy;
  }, [mentions, oldestFirst]);

  const accent = ACCENT_STYLES[activePerson?.accent ?? 'rose'];
  const maxYearCount = useMemo(
    () => Math.max(1, ...stats.byYear.map(([, c]) => c)),
    [stats.byYear]
  );

  const pinnedSet = useMemo(
    () => new Set((activePerson?.pinnedMilestones ?? []).map((p) => p.entryUuid.toUpperCase())),
    [activePerson]
  );

  const handleAddPerson = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
    const aliases = newAliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const nextPerson: PersonProfile = {
      id,
      name,
      aliases,
      role: newRole,
      accent: ACCENT_ORDER[people.length % ACCENT_ORDER.length],
      pinnedMilestones: [],
      hiddenEntryUuids: [],
    };
    await onUpdatePeople([...people, nextPerson]);
    setSelectedPersonId(id);
    setNewName('');
    setNewAliases('');
    setAddingPerson(false);
  };

  const handlePinMilestone = async (entryUuid: string, label?: string) => {
    if (!activePerson) return;
    const upper = entryUuid.toUpperCase();
    const updated = people.map((p) => {
      if (p.id !== activePerson.id) return p;
      const filtered = p.pinnedMilestones.filter((m) => m.entryUuid.toUpperCase() !== upper);
      return {
        ...p,
        pinnedMilestones: [...filtered, { entryUuid: upper, label: label?.trim() || undefined }],
        hiddenEntryUuids: p.hiddenEntryUuids.filter((u) => u.toUpperCase() !== upper),
      };
    });
    await onUpdatePeople(updated);
    setPinEditingUuid(null);
    setPinLabelInput('');
  };

  const handleUnpinMilestone = async (entryUuid: string) => {
    if (!activePerson) return;
    const upper = entryUuid.toUpperCase();
    const updated = people.map((p) =>
      p.id === activePerson.id
        ? {
            ...p,
            pinnedMilestones: p.pinnedMilestones.filter(
              (m) => m.entryUuid.toUpperCase() !== upper
            ),
          }
        : p
    );
    await onUpdatePeople(updated);
  };

  const handleHideFromHighlights = async (entryUuid: string) => {
    if (!activePerson) return;
    const upper = entryUuid.toUpperCase();
    const updated = people.map((p) =>
      p.id === activePerson.id
        ? {
            ...p,
            hiddenEntryUuids: Array.from(new Set([...p.hiddenEntryUuids, upper])),
          }
        : p
    );
    await onUpdatePeople(updated);
  };

  if (!activePerson) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      {/* Header & Person Picker */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-rose-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">People & Milestones</h2>
          </div>
          <button
            onClick={() => setAddingPerson((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {addingPerson ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {addingPerson ? 'Close' : 'Add'}
          </button>
        </div>

        {/* Person pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {people.map((person) => {
            const isSelected = person.id === activePerson.id;
            const style = ACCENT_STYLES[person.accent];
            return (
              <button
                key={person.id}
                onClick={() => setSelectedPersonId(person.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? style.pill
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Heart className={`w-3 h-3 ${isSelected ? 'fill-current' : ''}`} />
                {person.name}
              </button>
            );
          })}
        </div>

        {addingPerson && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (e.g. Mom)"
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:border-sky-400 focus:outline-none"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as PersonProfile['role'])}
                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none"
              >
                <option value="partner">Partner</option>
                <option value="child">Child</option>
                <option value="family">Family</option>
                <option value="friend">Friend</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input
              type="text"
              value={newAliases}
              onChange={(e) => setNewAliases(e.target.value)}
              placeholder="Optional nicknames (comma-separated)"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:border-sky-400 focus:outline-none"
            />
            <button
              onClick={() => void handleAddPerson()}
              disabled={!newName.trim()}
              className="w-full py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-semibold disabled:opacity-40 cursor-pointer"
            >
              Create Timeline
            </button>
          </div>
        )}

        {/* Stats summary */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {stats.totalMentions} {stats.totalMentions === 1 ? 'entry' : 'entries'} ·{' '}
              {milestones.length} highlights
            </span>
            {stats.photosCount > 0 && (
              <span className="text-slate-400">{stats.photosCount} photos</span>
            )}
          </div>
          {stats.firstDate && stats.latestDate && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {formatShortDate(stats.firstDate)} → {formatShortDate(stats.latestDate)}
            </p>
          )}
          {stats.byYear.length > 1 && (
            <div className="flex items-end gap-1 pt-1 h-8">
              {stats.byYear.map(([year, count]) => (
                <div
                  key={year}
                  title={`${year}: ${count} ${count === 1 ? 'entry' : 'entries'}`}
                  className="flex-1 flex flex-col items-center gap-0.5 min-w-0"
                >
                  <div
                    className={`w-full rounded-xs ${accent.bar}`}
                    style={{ height: `${Math.max(4, Math.round((count / maxYearCount) * 20))}px` }}
                  />
                  <span className="text-[9px] text-slate-400 truncate">{String(year).slice(-2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mode & Sort bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-900 p-0.5 text-xs">
            <button
              onClick={() => setTab('highlights')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                tab === 'highlights'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              Highlights ({milestones.length})
            </button>
            <button
              onClick={() => setTab('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                tab === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              All ({mentions.length})
            </button>
          </div>

          <button
            onClick={() => setOldestFirst((v) => !v)}
            title="Toggle timeline order"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            <ArrowDownUp className="w-3 h-3" />
            {oldestFirst ? 'Oldest first' : 'Newest first'}
          </button>
        </div>
      </div>

      {/* Timeline list */}
      <div className="flex-1 overflow-y-auto p-3.5">
        {tab === 'highlights' ? (
          sortedMilestones.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 space-y-2">
              <Sparkles className="w-7 h-7 mx-auto opacity-40" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                No milestones found for {activePerson.name} yet
              </p>
              <p className="text-xs">
                Switch to &ldquo;All&rdquo; to browse mentions and pin favorite moments to their
                highlight reel.
              </p>
            </div>
          ) : (
            <div className="relative pl-5 space-y-3 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {sortedMilestones.map((m) => {
                const { title } = splitEntryTitleAndPreview(m.entry.entryText);
                const photo = photosByUuid.get(m.entry.uuid.toUpperCase());
                const isSelected = m.entry.uuid === selectedUuid;

                return (
                  <div key={m.entry.uuid} className="relative">
                    <span
                      className={`absolute -left-5 top-3.5 w-3.5 h-3.5 rounded-full ring-4 ${accent.dot}`}
                    />

                    <div
                      onClick={() => onSelectEntry(m.entry.uuid)}
                      className={`rounded-xl border p-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-sky-400 bg-sky-50/70 dark:bg-sky-950/40 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${accent.badge}`}
                        >
                          {m.label || m.category}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-400">
                            {formatShortDate(m.entry.creationDate)}
                          </span>
                          {m.isPinned ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleUnpinMilestone(m.entry.uuid);
                              }}
                              title="Unpin milestone"
                              className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-sky-500 cursor-pointer"
                            >
                              <PinOff className="w-3 h-3" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPinEditingUuid(m.entry.uuid);
                                  setPinLabelInput(m.category);
                                }}
                                title="Pin & customize milestone label"
                                className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-sky-500 cursor-pointer"
                              >
                                <Pin className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleHideFromHighlights(m.entry.uuid);
                                }}
                                title="Hide from highlight reel"
                                className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 cursor-pointer"
                              >
                                <EyeOff className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {pinEditingUuid === m.entry.uuid && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mb-2 flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={pinLabelInput}
                            onChange={(e) => setPinLabelInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                void handlePinMilestone(m.entry.uuid, pinLabelInput);
                              }
                            }}
                            placeholder="Milestone label (e.g. Engaged!)"
                            className="flex-1 text-xs px-2 py-1 rounded-md border border-sky-400 bg-white dark:bg-slate-950 focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => void handlePinMilestone(m.entry.uuid, pinLabelInput)}
                            className="text-xs font-semibold px-2 py-1 rounded-md bg-sky-500 text-white cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      )}

                      <div className="flex items-start gap-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {title}
                            </h3>
                            {m.isStarred && (
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                            )}
                          </div>
                          {m.snippet && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                              <HighlightText text={m.snippet} query={activePerson.name} />
                            </p>
                          )}
                        </div>
                        {photo && (
                          <PhotoThumbnail
                            photo={photo}
                            className="w-12 h-12 rounded-lg shrink-0 border border-slate-200 dark:border-slate-800"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {sortedMentions.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                No entries mention {activePerson.name} yet.
              </p>
            ) : (
              sortedMentions.map(({ entry, snippet }) => {
                const { title } = splitEntryTitleAndPreview(entry.entryText);
                const photo = photosByUuid.get(entry.uuid.toUpperCase());
                const isSelected = entry.uuid === selectedUuid;
                const isPinned = pinnedSet.has(entry.uuid.toUpperCase());

                return (
                  <div
                    key={entry.uuid}
                    onClick={() => onSelectEntry(entry.uuid)}
                    className={`rounded-xl border p-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-sky-400 bg-sky-50/70 dark:bg-sky-950/40'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-medium text-slate-400">
                        {formatShortDate(entry.creationDate)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isPinned) {
                            void handleUnpinMilestone(entry.uuid);
                          } else {
                            setPinEditingUuid(entry.uuid);
                            setPinLabelInput('');
                          }
                        }}
                        title={isPinned ? 'Unpin from highlight reel' : 'Pin to highlight reel'}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded cursor-pointer ${
                          isPinned
                            ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10'
                            : 'text-slate-400 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Pin className="w-3 h-3" />
                        {isPinned ? 'Pinned' : 'Pin'}
                      </button>
                    </div>

                    {pinEditingUuid === entry.uuid && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mb-2 flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={pinLabelInput}
                          onChange={(e) => setPinLabelInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              void handlePinMilestone(entry.uuid, pinLabelInput);
                            }
                          }}
                          placeholder="Milestone label (optional)"
                          className="flex-1 text-xs px-2 py-1 rounded-md border border-sky-400 bg-white dark:bg-slate-950 focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => void handlePinMilestone(entry.uuid, pinLabelInput)}
                          className="text-xs font-semibold px-2 py-1 rounded-md bg-sky-500 text-white cursor-pointer"
                        >
                          Pin
                        </button>
                      </div>
                    )}

                    <div className="flex items-start gap-2.5">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                          <HighlightText text={snippet} query={activePerson.name} />
                        </p>
                      </div>
                      {photo && (
                        <PhotoThumbnail
                          photo={photo}
                          className="w-11 h-11 rounded-lg shrink-0 border border-slate-200 dark:border-slate-800"
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
});
