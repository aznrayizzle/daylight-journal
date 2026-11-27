import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  ExternalLink,
  EyeOff,
  Heart,
  ImagePlus,
  Images,
  Loader2,
  MapPin,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import type { JournalEntry, PersonProfile, PhotoRecord } from '../types';
import { formatFullDate, formatShortDate, getEntryDateParts } from '../lib/dateUtils';
import { splitEntryTitleAndPreview } from '../lib/doentry';
import { MarkdownPreview } from '../lib/markdown';
import {
  buildPersonHighlightReel,
  computePersonStats,
  type MilestoneFilterGroup,
  type MilestoneMatch,
} from '../lib/peopleMilestones';
import { HighlightText } from './HighlightText';
import { PhotoThumbnail } from './PhotoThumbnail';

interface PeopleViewProps {
  entries: JournalEntry[];
  photosByUuid: Map<string, PhotoRecord>;
  people: PersonProfile[];
  selectedUuid: string | null;
  isDriveSignedIn: boolean;
  isDriveMode: boolean;
  pickingGooglePhoto: boolean;
  curatingWithAi: boolean;
  curatingStatus?: string;
  onSyncDrive: () => void;
  onOpenInEditor: (uuid: string) => void;
  onUpdatePeople: (next: PersonProfile[]) => Promise<void>;
  onCurateWithAi: (person: PersonProfile) => Promise<void>;
  onSetMilestonePhoto: (personId: string, entryUuid: string, file: File) => Promise<void>;
  onPickMilestoneGooglePhoto: (personId: string, entryUuid: string) => Promise<void>;
  onResetMilestonePhoto: (personId: string, entryUuid: string) => Promise<void>;
}

const YEAR_BAR_PALETTE = [
  '#1B4965',
  '#21617D',
  '#287B94',
  '#3D8E9B',
  '#7D7A72',
  '#9C6B62',
  '#C85A43',
  '#A94A3E',
  '#475569',
];

const TILTS = ['-rotate-2', 'rotate-2', 'rotate-1', '-rotate-1'];
const ACCENT_ORDER: PersonProfile['accent'][] = ['rose', 'sky', 'amber', 'emerald', 'violet'];

export const PeopleView = memo(function PeopleView({
  entries,
  photosByUuid,
  people,
  selectedUuid,
  isDriveSignedIn,
  isDriveMode,
  pickingGooglePhoto,
  curatingWithAi,
  curatingStatus,
  onSyncDrive,
  onOpenInEditor,
  onUpdatePeople,
  onCurateWithAi,
  onSetMilestonePhoto,
  onPickMilestoneGooglePhoto,
  onResetMilestonePhoto,
}: PeopleViewProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string>(people[0]?.id ?? 'lucy');
  const [tab, setTab] = useState<'timeline' | 'all'>('timeline');
  const [filterGroup, setFilterGroup] = useState<'all' | MilestoneFilterGroup>('all');
  const [oldestFirst, setOldestFirst] = useState(true);
  const [activeEntryUuid, setActiveEntryUuid] = useState<string | null>(selectedUuid);
  const [addingPerson, setAddingPerson] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [newRole, setNewRole] = useState<PersonProfile['role']>('family');
  const [editingSummaryUuid, setEditingSummaryUuid] = useState<string | null>(null);
  const [summaryInput, setSummaryInput] = useState('');
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [allFilterQuery, setAllFilterQuery] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const yearRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const customPhotoInputRef = useRef<HTMLInputElement>(null);

  const activePerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId) ?? people[0],
    [people, selectedPersonId]
  );

  const { mentions, milestones } = useMemo(() => {
    if (!activePerson) return { mentions: [], milestones: [] };
    return buildPersonHighlightReel(entries, activePerson, photosByUuid);
  }, [entries, activePerson, photosByUuid]);

  const stats = useMemo(
    () => computePersonStats(mentions, photosByUuid),
    [mentions, photosByUuid]
  );

  const filteredMilestones = useMemo(() => {
    const base =
      filterGroup === 'all'
        ? milestones
        : milestones.filter((m) => m.filterGroup === filterGroup || m.isPinned);
    const copy = [...base];
    copy.sort((a, b) =>
      oldestFirst
        ? a.entry.creationDate.localeCompare(b.entry.creationDate)
        : b.entry.creationDate.localeCompare(a.entry.creationDate)
    );
    return copy;
  }, [milestones, filterGroup, oldestFirst]);

  // Group milestones by year so each year bar expands cleanly to hold 3-5+ memories
  const yearGroups = useMemo(() => {
    const map = new Map<number, MilestoneMatch[]>();
    for (const m of filteredMilestones) {
      const { year } = getEntryDateParts(m.entry);
      const list = map.get(year) ?? [];
      list.push(m);
      map.set(year, list);
    }

    const totalByYear = new Map<number, number>(stats.byYear);
    const years = Array.from(map.keys()).sort((a, b) => (oldestFirst ? a - b : b - a));
    return years.map((year, idx) => ({
      year,
      totalEntriesInYear: totalByYear.get(year) ?? map.get(year)!.length,
      color: YEAR_BAR_PALETTE[idx % YEAR_BAR_PALETTE.length],
      items: map.get(year)!,
    }));
  }, [filteredMilestones, stats.byYear, oldestFirst]);

  // Keep activeEntryUuid synced to a valid milestone when switching person/filter
  useEffect(() => {
    if (filteredMilestones.length === 0) {
      setActiveEntryUuid(mentions[0]?.entry.uuid ?? null);
      return;
    }
    if (!filteredMilestones.some((m) => m.entry.uuid === activeEntryUuid)) {
      setActiveEntryUuid(filteredMilestones[0].entry.uuid);
    }
  }, [activePerson?.id, filteredMilestones, mentions, activeEntryUuid]);

  const activeMilestone = useMemo(() => {
    if (!activeEntryUuid) return filteredMilestones[0] ?? null;
    return (
      filteredMilestones.find((m) => m.entry.uuid === activeEntryUuid) ??
      filteredMilestones[0] ??
      null
    );
  }, [filteredMilestones, activeEntryUuid]);

  const activeMentionEntry = useMemo(() => {
    if (activeMilestone) return activeMilestone.entry;
    return mentions.find((m) => m.entry.uuid === activeEntryUuid)?.entry ?? mentions[0]?.entry ?? null;
  }, [activeMilestone, mentions, activeEntryUuid]);

  const activeYear = activeMentionEntry ? getEntryDateParts(activeMentionEntry).year : null;

  const pinnedSet = useMemo(
    () => new Set((activePerson?.pinnedMilestones ?? []).map((p) => p.entryUuid.toUpperCase())),
    [activePerson]
  );

  const filteredAllMentions = useMemo(() => {
    const q = allFilterQuery.trim().toLowerCase();
    const list = q
      ? mentions.filter((m) => m.entry.entryText.toLowerCase().includes(q))
      : mentions;
    const copy = [...list];
    copy.sort((a, b) =>
      oldestFirst
        ? a.entry.creationDate.localeCompare(b.entry.creationDate)
        : b.entry.creationDate.localeCompare(a.entry.creationDate)
    );
    return copy;
  }, [mentions, allFilterQuery, oldestFirst]);

  const scrollByAmount = (dx: number) => {
    scrollContainerRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

  const jumpToYear = (year: number) => {
    const el = yearRefs.current.get(year);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  };

  const stepMilestone = (delta: number) => {
    if (filteredMilestones.length < 2 || !activeMilestone) return;
    const idx = filteredMilestones.findIndex(
      (m) => m.entry.uuid === activeMilestone.entry.uuid
    );
    const next =
      filteredMilestones[(idx + delta + filteredMilestones.length) % filteredMilestones.length];
    if (next) {
      setActiveEntryUuid(next.entry.uuid);
      jumpToYear(getEntryDateParts(next.entry).year);
    }
  };

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

  const handleUpdateStartDate = async (nextDate: string) => {
    if (!activePerson) return;
    const updated = people.map((p) =>
      p.id === activePerson.id ? { ...p, startDate: nextDate } : p
    );
    await onUpdatePeople(updated);
    setEditingStartDate(false);
  };

  const handlePinMilestone = async (entryUuid: string, label?: string) => {
    if (!activePerson) return;
    const upper = entryUuid.toUpperCase();
    const updated = people.map((p) => {
      if (p.id !== activePerson.id) return p;
      const existing = p.pinnedMilestones.find((m) => m.entryUuid.toUpperCase() === upper);
      const filtered = p.pinnedMilestones.filter((m) => m.entryUuid.toUpperCase() !== upper);
      return {
        ...p,
        pinnedMilestones: [
          ...filtered,
          {
            ...existing,
            entryUuid: upper,
            label: label?.trim() || undefined,
          },
        ],
        hiddenEntryUuids: p.hiddenEntryUuids.filter((u) => u.toUpperCase() !== upper),
      };
    });
    await onUpdatePeople(updated);
    setEditingSummaryUuid(null);
    setSummaryInput('');
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

  const resolveMilestonePhoto = (m: MilestoneMatch): PhotoRecord | undefined => {
    if (m.customPhotoKey) {
      const custom = photosByUuid.get(m.customPhotoKey.toUpperCase());
      if (custom) return custom;
    }
    const upper = m.entry.uuid.toUpperCase();
    const direct = photosByUuid.get(upper) ?? photosByUuid.get(upper.replace(/-/g, ''));
    if (direct) return direct;
    const stem = m.entry.fileName.replace(/\.doentry$/i, '').toUpperCase();
    return photosByUuid.get(stem) ?? photosByUuid.get(stem.replace(/-/g, ''));
  };

  // Detect if any visible milestone has a Drive photo that isn't cached yet while signed out
  const hasUncachedDrivePhotos = useMemo(() => {
    if (!isDriveMode || isDriveSignedIn) return false;
    return filteredMilestones.some((m) => {
      const p = resolveMilestonePhoto(m);
      return Boolean(p && p.fileId && !p.data && !p.blob);
    });
  }, [isDriveMode, isDriveSignedIn, filteredMilestones, photosByUuid]);

  const renderPolaroidCard = (m: MilestoneMatch, position: 'top' | 'bottom', tiltIdx: number) => {
    const isSel = activeMilestone?.entry.uuid === m.entry.uuid;
    const photo = resolveMilestonePhoto(m);
    const tilt = TILTS[tiltIdx % TILTS.length];
    const shortDate = formatShortDate(m.entry.creationDate);
    const { year } = getEntryDateParts(m.entry);

    const summaryBlock = (
      <div className="max-w-[186px] text-center">
        <div
          className="text-[10px] font-extrabold uppercase tracking-wider truncate"
          style={{ color: m.color }}
        >
          {m.category}
        </div>
        <p className="text-xs font-semibold leading-snug text-slate-800 dark:text-slate-100 line-clamp-2 mt-0.5">
          {m.summary}
        </p>
      </div>
    );

    const polaroidFrame = (
      <div
        className={`relative p-1.5 pb-3.5 bg-white dark:bg-slate-100 rounded-[2px] shadow-md border transition-all duration-300 ${tilt} group-hover:rotate-0 group-hover:-translate-y-1 ${
          isSel
            ? 'ring-2 ring-sky-500 border-sky-500 !rotate-0 scale-[1.04] shadow-lg'
            : 'border-slate-200/90'
        }`}
      >
        <div className="w-[164px] h-[108px] overflow-hidden bg-slate-100 relative">
          {photo ? (
            <PhotoThumbnail photo={photo} eager className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full p-2.5 flex flex-col justify-between text-left"
              style={{
                background: `linear-gradient(135deg, ${m.color}18, ${m.color}32)`,
              }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: m.color }}
              >
                {m.category}
              </span>
              <p className="text-[11px] leading-snug text-slate-700 line-clamp-3 font-serif italic">
                “{m.summary}”
              </p>
            </div>
          )}
          {m.isPinned && (
            <span
              title="Pinned milestone"
              className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-slate-900/70 text-white flex items-center justify-center"
            >
              <Pin className="w-2.5 h-2.5" />
            </span>
          )}
          {!m.isPinned && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                void handleHideFromHighlights(m.entry.uuid);
              }}
              title="Remove from highlight reel"
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-slate-900/70 hover:bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </div>
        <div className="mt-1.5 px-0.5 flex items-center justify-between text-slate-600">
          <span className="font-serif italic text-[11px] font-medium">{year}</span>
          <span className="text-[10px] text-slate-400">{shortDate.split(',')[0]}</span>
        </div>
      </div>
    );

    const stem =
      position === 'top' ? (
        <div className="flex flex-col items-center mt-1.5">
          <div
            className="w-0.5 h-5 transition-opacity"
            style={{ background: m.color, opacity: isSel ? 1 : 0.6 }}
          />
          <div className="w-5 h-1 rounded-full" style={{ background: m.color }} />
        </div>
      ) : (
        <div className="flex flex-col items-center mb-1.5">
          <div className="w-5 h-1 rounded-full" style={{ background: m.color }} />
          <div
            className="w-0.5 h-5 transition-opacity"
            style={{ background: m.color, opacity: isSel ? 1 : 0.6 }}
          />
        </div>
      );

    return (
      <div key={m.entry.uuid} className="w-[196px] shrink-0 flex flex-col items-center">
        {position === 'bottom' && stem}
        <button
          onClick={() => setActiveEntryUuid(m.entry.uuid)}
          className="group flex flex-col items-center cursor-pointer focus:outline-none"
        >
          {position === 'bottom' && <div className="mb-2">{summaryBlock}</div>}
          {polaroidFrame}
          {position === 'top' && <div className="mt-2">{summaryBlock}</div>}
        </button>
        {position === 'top' && stem}
      </div>
    );
  };

  const activePhoto = activeMilestone
    ? resolveMilestonePhoto(activeMilestone)
    : activeMentionEntry
      ? photosByUuid.get(activeMentionEntry.uuid.toUpperCase())
      : undefined;
  const activeIdx = activeMilestone
    ? filteredMilestones.findIndex((m) => m.entry.uuid === activeMilestone.entry.uuid)
    : -1;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Top Bar: Person Switcher + Controls */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 mr-1 text-slate-500 dark:text-slate-400">
              <Users className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">
                People
              </span>
            </div>

            {people.map((person) => {
              const isSel = person.id === activePerson.id;
              return (
                <button
                  key={person.id}
                  onClick={() => {
                    setSelectedPersonId(person.id);
                    setFilterGroup('all');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    isSel
                      ? 'bg-sky-500 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Heart className={`w-3 h-3 ${isSel ? 'fill-current' : ''}`} />
                  {person.name}
                </button>
              );
            })}

            <button
              onClick={() => setAddingPerson((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"
            >
              {addingPerson ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {addingPerson ? 'Close' : 'Add Person'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void onCurateWithAi(activePerson)}
              disabled={curatingWithAi || mentions.length === 0}
              title="Use Gemini AI to pick the biggest milestones and write crisp 1-sentence summaries"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 hover:brightness-105 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {curatingWithAi ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {curatingWithAi ? curatingStatus || 'Curating…' : 'Curate with AI'}
            </button>

            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-900 p-0.5 text-xs">
              <button
                onClick={() => setTab('timeline')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  tab === 'timeline'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Timeline ({milestones.length})
              </button>
              <button
                onClick={() => setTab('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  tab === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                All Mentions ({mentions.length})
              </button>
            </div>

            <button
              onClick={() => setOldestFirst((v) => !v)}
              title="Toggle chronological order"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ArrowDownUp className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{oldestFirst ? 'Oldest first' : 'Newest first'}</span>
            </button>
          </div>
        </div>

        {/* Add Person inline form */}
        {addingPerson && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. Mom)"
              className="flex-1 min-w-[130px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:border-sky-400 focus:outline-none"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as PersonProfile['role'])}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none"
            >
              <option value="partner">Partner</option>
              <option value="child">Child</option>
              <option value="family">Family</option>
              <option value="friend">Friend</option>
              <option value="other">Other</option>
            </select>
            <input
              type="text"
              value={newAliases}
              onChange={(e) => setNewAliases(e.target.value)}
              placeholder="Optional nicknames (comma-separated)"
              className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:border-sky-400 focus:outline-none"
            />
            <button
              onClick={() => void handleAddPerson()}
              disabled={!newName.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-semibold disabled:opacity-40 cursor-pointer"
            >
              Create
            </button>
          </div>
        )}

        {/* Editorial Headline + Start Date + Chapter Filters + Year Jump */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-1">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {stats.firstDate && stats.latestDate && (
                <span className="font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {formatShortDate(stats.firstDate)} — {formatShortDate(stats.latestDate)}
                </span>
              )}
              <span className="text-slate-400">
                · {stats.totalMentions} entries · {stats.photosCount} photos
              </span>

              {editingStartDate ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="date"
                    defaultValue={activePerson.startDate || ''}
                    onChange={(e) => void handleUpdateStartDate(e.target.value)}
                    className="text-xs px-1.5 py-0.5 rounded border border-sky-400 bg-white dark:bg-slate-900"
                  />
                  <button
                    onClick={() => setEditingStartDate(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    Done
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setEditingStartDate(true)}
                  title="Change earliest date shown on this timeline"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"
                >
                  <Calendar className="w-3 h-3" />
                  {activePerson.startDate ? `From ${activePerson.startDate}` : 'All dates'}
                </button>
              )}

              {hasUncachedDrivePhotos && (
                <button
                  onClick={onSyncDrive}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold hover:brightness-95 cursor-pointer"
                >
                  <CloudOff className="w-3 h-3" />
                  Reconnect Drive to load photos
                </button>
              )}
            </div>
            <h2 className="font-serif italic text-2xl sm:text-3xl text-slate-900 dark:text-white leading-tight mt-0.5">
              {activePerson.name}’s Story
            </h2>
          </div>

          {tab === 'timeline' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', 'All Chapters'],
                  ['milestones', 'Big Moments'],
                  ['trips', 'Trips'],
                  ['family', 'Family'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilterGroup(id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    filterGroup === id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Year Jump Pills (for quick navigation across many years) */}
        {tab === 'timeline' && yearGroups.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
              Jump to year:
            </span>
            {yearGroups.map((yg) => (
              <button
                key={yg.year}
                onClick={() => jumpToYear(yg.year)}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  activeYear === yg.year
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {yg.year}
                <span className="opacity-70 ml-1">({yg.items.length})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* BODY: Hybrid Polaroid Timeline OR All Mentions Browser */}
      {tab === 'timeline' ? (
        <div className="flex-1 flex flex-col">
          {yearGroups.length === 0 ? (
            <div className="py-16 px-6 text-center text-slate-400 space-y-2">
              <Sparkles className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                No milestones detected for {activePerson.name} in this filter yet.
              </p>
              <p className="text-xs">
                Switch to <strong>All Mentions</strong> to browse entries and pin favorite memories
                to this timeline.
              </p>
            </div>
          ) : (
            <>
              {/* Horizontal Hybrid Polaroid + Segmented Year Axis */}
              <div className="relative bg-slate-100/70 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => scrollByAmount(-420)}
                  aria-label="Scroll timeline left"
                  className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-md items-center justify-center text-slate-700 dark:text-slate-200 hover:scale-105 transition cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                  onClick={() => scrollByAmount(420)}
                  aria-label="Scroll timeline right"
                  className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-md items-center justify-center text-slate-700 dark:text-slate-200 hover:scale-105 transition cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                <div
                  ref={scrollContainerRef}
                  className="overflow-x-auto px-6 sm:px-12 py-7 scroll-smooth"
                >
                  <div className="flex items-stretch gap-3 min-w-max">
                    {yearGroups.map((yg, yIdx) => {
                      const topItems = yg.items.filter((_, i) => i % 2 === 0);
                      const bottomItems = yg.items.filter((_, i) => i % 2 === 1);
                      const isYearSel = activeYear === yg.year;
                      const isFirst = yIdx === 0;
                      const isLast = yIdx === yearGroups.length - 1;

                      return (
                        <div
                          key={yg.year}
                          ref={(el) => {
                            if (el) yearRefs.current.set(yg.year, el);
                            else yearRefs.current.delete(yg.year);
                          }}
                          className="flex flex-col justify-between shrink-0"
                        >
                          {/* Upper Polaroids Row (scales to 1, 2, 3, 5+ memories in this year) */}
                          <div className="flex items-end justify-around gap-4 px-2 min-h-[224px]">
                            {topItems.map((m, idx) => renderPolaroidCard(m, 'top', yIdx + idx))}
                          </div>

                          {/* Segmented Year Bar spanning all memories in this year */}
                          <div
                            className={`h-14 px-5 flex items-center justify-center gap-3 text-white transition-all my-1.5 ${
                              isFirst && isLast
                                ? 'rounded-full'
                                : isFirst
                                  ? 'rounded-l-full rounded-r-sm'
                                  : isLast
                                    ? 'rounded-r-full rounded-l-sm'
                                    : 'rounded-sm'
                            } ${
                              isYearSel
                                ? 'ring-2 ring-offset-2 ring-sky-500 dark:ring-offset-slate-950 shadow-md'
                                : 'opacity-90'
                            }`}
                            style={{ background: yg.color }}
                          >
                            <span className="font-serif italic font-bold text-lg tracking-wide">
                              {yg.year}
                            </span>
                            <span className="text-xs opacity-80">
                              {yg.items.length} {yg.items.length === 1 ? 'memory' : 'memories'}
                              {yg.totalEntriesInYear > yg.items.length
                                ? ` · ${yg.totalEntriesInYear} total`
                                : ''}
                            </span>
                          </div>

                          {/* Lower Polaroids Row (staggered slightly for editorial balance) */}
                          <div className="flex items-start justify-around gap-4 px-8 min-h-[224px]">
                            {bottomItems.length > 0 ? (
                              bottomItems.map((m, idx) =>
                                renderPolaroidCard(m, 'bottom', yIdx + idx + 2)
                              )
                            ) : (
                              <div className="h-[24px]" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Integrated Entry Reader below the Polaroid Timeline */}
              {activeMilestone && activeMentionEntry && (
                <div className="max-w-4xl w-full mx-auto p-4 sm:p-6 pb-24">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                    {/* Reader Toolbar */}
                    <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className="font-bold px-2.5 py-0.5 rounded-full text-white"
                          style={{ background: activeMilestone.color }}
                        >
                          {activeMilestone.category}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {formatFullDate(activeMentionEntry.creationDate)}
                        </span>
                        {activeMentionEntry.location?.placeName && (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <MapPin className="w-3 h-3" />
                            {activeMentionEntry.location.placeName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {filteredMilestones.length > 1 && (
                          <>
                            <span className="text-xs text-slate-400 mr-1">
                              {activeIdx + 1} / {filteredMilestones.length}
                            </span>
                            <button
                              onClick={() => stepMilestone(-1)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
                            >
                              ← Prev
                            </button>
                            <button
                              onClick={() => stepMilestone(1)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
                            >
                              Next →
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => onOpenInEditor(activeMentionEntry.uuid)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open Entry
                        </button>
                      </div>
                    </div>

                    {/* Editable 1-line Milestone Summary + Replace Polaroid Photo Bar */}
                    <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <input
                        ref={customPhotoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f && activeMentionEntry) {
                            void onSetMilestonePhoto(activePerson.id, activeMentionEntry.uuid, f);
                          }
                        }}
                        className="hidden"
                      />

                      {editingSummaryUuid === activeMentionEntry.uuid ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={summaryInput}
                            onChange={(e) => setSummaryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                void handlePinMilestone(activeMentionEntry.uuid, summaryInput);
                              }
                            }}
                            placeholder="1-line milestone summary (e.g. Engagement at the Grand Canyon)"
                            className="flex-1 px-2.5 py-1 rounded-lg border border-sky-400 bg-white dark:bg-slate-950 focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() =>
                              void handlePinMilestone(activeMentionEntry.uuid, summaryInput)
                            }
                            className="px-2.5 py-1 rounded-lg bg-sky-500 text-white font-semibold cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingSummaryUuid(null)}
                            className="px-2 py-1 text-slate-500 hover:text-slate-700 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
                              Summary:
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {activeMilestone.summary}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                void onPickMilestoneGooglePhoto(
                                  activePerson.id,
                                  activeMentionEntry.uuid
                                )
                              }
                              disabled={pickingGooglePhoto}
                              title="Pick a Polaroid photo from Google Photos (does not change the entry's original photo)"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 font-medium cursor-pointer disabled:opacity-50"
                            >
                              {pickingGooglePhoto ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Images className="w-3 h-3" />
                              )}
                              {pickingGooglePhoto ? 'Picking…' : 'Google Photos'}
                            </button>

                            <button
                              onClick={() => customPhotoInputRef.current?.click()}
                              title="Upload a custom Polaroid photo from this device"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <ImagePlus className="w-3 h-3" />
                              Replace photo
                            </button>

                            {activeMilestone.customPhotoKey && (
                              <button
                                onClick={() =>
                                  void onResetMilestonePhoto(
                                    activePerson.id,
                                    activeMentionEntry.uuid
                                  )
                                }
                                title="Revert Polaroid back to the entry's original photo"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Reset photo
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setEditingSummaryUuid(activeMentionEntry.uuid);
                                setSummaryInput(activeMilestone.label || activeMilestone.summary);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit summary
                            </button>
                            {activeMilestone.isPinned ? (
                              <button
                                onClick={() => void handleUnpinMilestone(activeMentionEntry.uuid)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sky-600 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <PinOff className="w-3 h-3" />
                                Unpin
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  void handleHideFromHighlights(activeMentionEntry.uuid)
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <EyeOff className="w-3 h-3" />
                                Hide
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Full Photo + Entry Body */}
                    <div className="p-5 sm:p-6 space-y-5">
                      {activePhoto && (
                        <div className="flex justify-center">
                          <div className="inline-flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                            <PhotoThumbnail
                              photo={activePhoto}
                              fit="contain"
                              eager
                              className="block max-w-full max-h-[50vh] w-auto h-auto"
                            />
                          </div>
                        </div>
                      )}
                      <MarkdownPreview content={activeMentionEntry.entryText} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ALL MENTIONS TAB — Browse & Pin any entry to the Polaroid Timeline */
        <div className="max-w-3xl w-full mx-auto p-4 sm:p-6 pb-24 space-y-3">
          <input
            type="search"
            value={allFilterQuery}
            onChange={(e) => setAllFilterQuery(e.target.value)}
            placeholder={`Filter ${mentions.length} entries mentioning ${activePerson.name}…`}
            className="w-full px-3.5 py-2 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-sky-400 focus:outline-none"
          />

          {filteredAllMentions.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">
              No entries match this filter.
            </p>
          ) : (
            filteredAllMentions.map(({ entry, snippet }) => {
              const { title } = splitEntryTitleAndPreview(entry.entryText);
              const photo = photosByUuid.get(entry.uuid.toUpperCase());
              const isPinned = pinnedSet.has(entry.uuid.toUpperCase());

              return (
                <div
                  key={entry.uuid}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {formatShortDate(entry.creationDate)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          if (isPinned) {
                            void handleUnpinMilestone(entry.uuid);
                          } else {
                            setEditingSummaryUuid(entry.uuid);
                            setSummaryInput(title);
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                          isPinned
                            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-950 hover:text-sky-600'
                        }`}
                      >
                        <Pin className="w-3 h-3" />
                        {isPinned ? 'Pinned to Timeline' : 'Pin to Timeline'}
                      </button>
                      <button
                        onClick={() => onOpenInEditor(entry.uuid)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </button>
                    </div>
                  </div>

                  {editingSummaryUuid === entry.uuid && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={summaryInput}
                        onChange={(e) => setSummaryInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            void handlePinMilestone(entry.uuid, summaryInput);
                          }
                        }}
                        placeholder="1-line milestone summary…"
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-sky-400 bg-white dark:bg-slate-950 focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => void handlePinMilestone(entry.uuid, summaryInput)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-500 text-white cursor-pointer"
                      >
                        Pin
                      </button>
                    </div>
                  )}

                  <div
                    onClick={() => onOpenInEditor(entry.uuid)}
                    className="flex items-start gap-3 cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {title}
                        </h3>
                        {entry.starred && (
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                        <HighlightText text={snippet} query={activePerson.name} />
                      </p>
                    </div>
                    {photo && (
                      <PhotoThumbnail
                        photo={photo}
                        className="w-14 h-14 rounded-lg shrink-0 border border-slate-200 dark:border-slate-800"
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
  );
});
