import {
  BookOpen,
  Calendar,
  Cloud,
  CloudOff,
  Flame,
  History,
  Images,
  Plus,
  RefreshCw,
  Settings,
  Star,
  Tag,
} from 'lucide-react';
import type { ActiveView, AppSettings, SyncProgress } from '../types';

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  totalCount: number;
  favoritesCount: number;
  photosCount: number;
  onThisDayCount: number;
  writingStreak: number;
  pendingSyncCount: number;
  tagCounts: [string, number][];
  settings: AppSettings;
  isDriveSignedIn: boolean;
  syncProgress: SyncProgress;
  onSync: () => void;
  onNewEntry: () => void;
}

export function Sidebar({
  activeView,
  onSelectView,
  selectedTag,
  onSelectTag,
  totalCount,
  favoritesCount,
  photosCount,
  onThisDayCount,
  writingStreak,
  pendingSyncCount,
  tagCounts,
  settings,
  isDriveSignedIn,
  syncProgress,
  onSync,
  onNewEntry,
}: SidebarProps) {
  const isSyncing =
    syncProgress.phase !== 'idle' &&
    syncProgress.phase !== 'done' &&
    syncProgress.phase !== 'error';

  const navItemClass = (active: boolean) =>
    `w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70'
    }`;

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70 select-none">
      {/* Brand header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-sm">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              Daylight
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {settings.mode === 'demo' ? 'Demo Journal' : 'Google Drive'}
            </p>
          </div>
        </div>
        {writingStreak > 0 && (
          <span
            title={`${writingStreak}-day journaling streak`}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300"
          >
            <Flame className="w-3 h-3 text-amber-500" />
            {writingStreak}d
          </span>
        )}
      </div>

      {/* Primary CTA */}
      <div className="px-3 pb-3">
        <button
          onClick={onNewEntry}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Entry
        </button>
      </div>

      {/* Main navigation */}
      <nav className="px-2 space-y-0.5">
        <button
          onClick={() => {
            onSelectTag(null);
            onSelectView('timeline');
          }}
          className={navItemClass(activeView === 'timeline' && !selectedTag)}
        >
          <span className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4" />
            All Entries
          </span>
          <span className="text-xs opacity-70">{totalCount}</span>
        </button>

        <button
          onClick={() => {
            onSelectTag(null);
            onSelectView('on-this-day');
          }}
          className={navItemClass(activeView === 'on-this-day')}
        >
          <span className="flex items-center gap-2.5">
            <History className="w-4 h-4" />
            On This Day
          </span>
          {onThisDayCount > 0 && (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
              {onThisDayCount}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            onSelectTag(null);
            onSelectView('calendar');
          }}
          className={navItemClass(activeView === 'calendar')}
        >
          <span className="flex items-center gap-2.5">
            <Calendar className="w-4 h-4" />
            Calendar
          </span>
        </button>

        <button
          onClick={() => {
            onSelectTag(null);
            onSelectView('photos');
          }}
          className={navItemClass(activeView === 'photos')}
        >
          <span className="flex items-center gap-2.5">
            <Images className="w-4 h-4" />
            Photos
          </span>
          <span className="text-xs opacity-70">{photosCount}</span>
        </button>

        <button
          onClick={() => {
            onSelectTag(null);
            onSelectView('favorites');
          }}
          className={navItemClass(activeView === 'favorites')}
        >
          <span className="flex items-center gap-2.5">
            <Star className="w-4 h-4" />
            Favorites
          </span>
          <span className="text-xs opacity-70">{favoritesCount}</span>
        </button>
      </nav>

      {/* Tags section */}
      <div className="mt-5 px-4 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Tags
        </span>
        {selectedTag && (
          <button
            onClick={() => onSelectTag(null)}
            className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
      <div className="mt-1.5 px-2 flex-1 overflow-y-auto space-y-0.5">
        {tagCounts.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-slate-400">No tags yet</p>
        ) : (
          tagCounts.map(([tag, count]) => (
            <button
              key={tag}
              onClick={() => {
                onSelectTag(selectedTag === tag ? null : tag);
                onSelectView('timeline');
              }}
              className={navItemClass(activeView === 'timeline' && selectedTag === tag)}
            >
              <span className="flex items-center gap-2 truncate">
                <Tag className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="truncate">{tag}</span>
              </span>
              <span className="text-xs opacity-70 shrink-0">{count}</span>
            </button>
          ))
        )}
      </div>

      {/* Sync & Settings footer */}
      <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1">
        {settings.mode === 'drive' && (
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <span className="flex items-center gap-2 truncate">
              {isDriveSignedIn ? (
                <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <CloudOff className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span className="truncate">
                {isSyncing
                  ? syncProgress.message
                  : pendingSyncCount > 0
                    ? `Sync (${pendingSyncCount} unsynced)`
                    : isDriveSignedIn
                      ? 'Sync Drive'
                      : 'Reconnect Drive'}
              </span>
            </span>
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}

        <button
          onClick={() => onSelectView('settings')}
          className={navItemClass(activeView === 'settings')}
        >
          <span className="flex items-center gap-2.5">
            <Settings className="w-4 h-4" />
            Settings & Drive
          </span>
        </button>
      </div>
    </aside>
  );
}
