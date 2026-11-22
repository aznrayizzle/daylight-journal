import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  History,
  Plus,
  Settings,
  Star,
  X,
} from 'lucide-react';
import type { ActiveView, AppSettings, JournalEntry, PhotoRecord, SyncProgress } from './types';
import {
  clearEntriesAndPhotos,
  DEFAULT_FOLDER_ID,
  deleteEntryFromDb,
  deletePhotoFromDb,
  getAllEntries,
  getAllPhotos,
  loadSettings,
  putEntriesBatch,
  putEntry,
  putPhoto,
  putPhotosBatch,
  saveSettings,
} from './lib/db';
import { createNewEntry, parseDoentryXml, serializeDoentryXml } from './lib/doentry';
import { driveService } from './lib/googleDrive';
import { pickPhotoFromGooglePhotos } from './lib/googlePhotosPicker';
import { buildDemoJournal, isDemoEntry } from './lib/demoData';
import { getOnThisDayEntries } from './lib/dateUtils';
import { Sidebar } from './components/Sidebar';
import { TimelineList } from './components/TimelineList';
import { OnThisDayView } from './components/OnThisDayView';
import { CalendarView } from './components/CalendarView';
import { EntryEditor } from './components/EntryEditor';
import { SettingsView } from './components/SettingsView';

const IDLE_SYNC: SyncProgress = {
  phase: 'idle',
  completed: 0,
  total: 0,
  message: '',
};

export function App() {
  const [settings, setSettings] = useState<AppSettings>({
    clientId: '',
    rootFolderId: DEFAULT_FOLDER_ID,
    mode: 'demo',
  });
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>('timeline');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [mobileShowEditor, setMobileShowEditor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isDriveSignedIn, setIsDriveSignedIn] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(IDLE_SYNC);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pickingGooglePhoto, setPickingGooglePhoto] = useState(false);
  const [toast, setToast] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const [booted, setBooted] = useState(false);

  const showToast = useCallback((message: string, type: 'info' | 'error' = 'info') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Initial load from IndexedDB (and seed demo journal on first visit)
  useEffect(() => {
    const boot = async () => {
      const loadedSettings = await loadSettings();
      let loadedEntries = await getAllEntries();
      let loadedPhotos = await getAllPhotos();

      if (loadedSettings.mode === 'demo' && loadedEntries.length === 0) {
        const demo = buildDemoJournal();
        await putEntriesBatch(demo.entries);
        await putPhotosBatch(demo.photos);
        loadedEntries = demo.entries;
        loadedPhotos = demo.photos;
      } else if (loadedSettings.mode === 'drive') {
        // Auto-purge any leftover demo entries/photos from an earlier sync
        const staleDemoEntries = loadedEntries.filter(isDemoEntry);
        if (staleDemoEntries.length > 0) {
          const demoUuids = new Set(staleDemoEntries.map((e) => e.uuid.toUpperCase()));
          for (const e of staleDemoEntries) {
            await deleteEntryFromDb(e.uuid);
          }
          for (const p of loadedPhotos) {
            if (!p.fileId && (demoUuids.has(p.uuid.toUpperCase()) || p.mimeType === 'image/svg+xml')) {
              await deletePhotoFromDb(p.uuid);
            }
          }
          loadedEntries = loadedEntries.filter((e) => !isDemoEntry(e));
          loadedPhotos = loadedPhotos.filter(
            (p) => p.fileId || (!demoUuids.has(p.uuid.toUpperCase()) && p.mimeType !== 'image/svg+xml')
          );
        }
      }

      setSettings(loadedSettings);
      setEntries(loadedEntries);
      setPhotos(loadedPhotos);
      if (loadedEntries.length > 0) {
        setSelectedUuid(loadedEntries[0].uuid);
      }
      setBooted(true);
    };
    void boot();
  }, []);

  const photosByUuid = useMemo(() => {
    const map = new Map<string, PhotoRecord>();
    for (const p of photos) {
      map.set(p.uuid.toUpperCase(), p);
    }
    return map;
  }, [photos]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const t of e.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [entries]);

  const allTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);

  const favoritesCount = useMemo(
    () => entries.filter((e) => e.starred).length,
    [entries]
  );

  const todayOnThisDay = useMemo(() => {
    const now = new Date();
    return getOnThisDayEntries(entries, now.getMonth(), now.getDate(), now.getFullYear());
  }, [entries]);

  const onThisDayPastCount = useMemo(
    () => todayOnThisDay.filter((m) => m.yearsAgo > 0).length,
    [todayOnThisDay]
  );

  // Instant full-text search + tag + favorites filtering
  const filteredEntries = useMemo(() => {
    const words = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return entries.filter((entry) => {
      if (activeView === 'favorites' && !entry.starred) return false;
      if (selectedTag && !entry.tags.includes(selectedTag)) return false;

      if (words.length > 0) {
        const haystack = [
          entry.entryText,
          entry.tags.join(' '),
          entry.location?.placeName ?? '',
          entry.location?.locality ?? '',
          entry.location?.country ?? '',
        ]
          .join(' ')
          .toLowerCase();
        for (const w of words) {
          if (!haystack.includes(w)) return false;
        }
      }
      return true;
    });
  }, [entries, activeView, selectedTag, searchQuery]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.uuid === selectedUuid) ?? null,
    [entries, selectedUuid]
  );

  const handleBlobLoaded = useCallback((uuid: string, blob: Blob) => {
    setPhotos((prev) =>
      prev.map((p) => (p.uuid === uuid.toUpperCase() ? { ...p, blob } : p))
    );
  }, []);

  const handleSaveSettings = async (next: AppSettings) => {
    setSettings(next);
    await saveSettings(next);
  };

  const handleConnectAndSync = async (clientIdOverride?: string, folderIdOverride?: string) => {
    const activeClientId = (clientIdOverride ?? settings.clientId).trim();
    const activeFolderId = (folderIdOverride ?? settings.rootFolderId).trim() || DEFAULT_FOLDER_ID;

    if (!activeClientId) {
      setActiveView('settings');
      showToast('Enter your Google Cloud OAuth Client ID in Settings to connect.', 'error');
      return;
    }

    try {
      if (!driveService.isSignedIn()) {
        await driveService.signIn(activeClientId);
        setIsDriveSignedIn(true);
      }

      // If transitioning from demo mode to Drive mode, clear demo data first
      if (settings.mode === 'demo') {
        await clearEntriesAndPhotos();
      }

      const result = await driveService.syncFromDrive(activeFolderId, setSyncProgress);
      const updatedSettings: AppSettings = {
        ...settings,
        clientId: activeClientId,
        rootFolderId: activeFolderId,
        mode: 'drive',
        entriesFolderId: result.entriesFolderId,
        photosFolderId: result.photosFolderId,
        layoutType: result.layoutType,
        lastSyncAt: new Date().toISOString(),
      };
      await saveSettings(updatedSettings);
      setSettings(updatedSettings);

      const freshEntries = await getAllEntries();
      const freshPhotos = await getAllPhotos();
      setEntries(freshEntries);
      setPhotos(freshPhotos);
      if (freshEntries.length > 0 && !freshEntries.some((e) => e.uuid === selectedUuid)) {
        setSelectedUuid(freshEntries[0].uuid);
      }
      showToast(`Synced ${result.totalCount} entries from Google Drive.`);
      if (activeView === 'settings' && freshEntries.length > 0) {
        setActiveView('timeline');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sync with Google Drive.';
      setSyncProgress({ phase: 'error', completed: 0, total: 0, message: msg });
      setIsDriveSignedIn(driveService.isSignedIn());
      showToast(msg, 'error');
    }
  };

  const handleSignOutDrive = () => {
    driveService.signOut();
    setIsDriveSignedIn(false);
    setSyncProgress(IDLE_SYNC);
    showToast('Signed out of Google Drive. Cached entries remain viewable offline.');
  };

  const handleSwitchToDemo = async () => {
    driveService.signOut();
    setIsDriveSignedIn(false);
    await clearEntriesAndPhotos();
    const demo = buildDemoJournal();
    await putEntriesBatch(demo.entries);
    await putPhotosBatch(demo.photos);
    const nextSettings: AppSettings = {
      ...settings,
      mode: 'demo',
    };
    await saveSettings(nextSettings);
    setSettings(nextSettings);
    setEntries(demo.entries);
    setPhotos(demo.photos);
    setSelectedUuid(demo.entries[0]?.uuid ?? null);
    setSyncProgress(IDLE_SYNC);
    showToast('Switched to Demo Mode.');
  };

  const handleImportLocalDoentries = async (files: FileList) => {
    const imported: JournalEntry[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = parseDoentryXml(text, {
          fileName: file.name,
          modifiedTime: new Date(file.lastModified).toISOString(),
        });
        imported.push(parsed);
      } catch (err) {
        console.warn(`Could not import ${file.name}:`, err);
      }
    }

    if (imported.length === 0) {
      showToast('No valid .doentry XML files found in selection.', 'error');
      return;
    }

    await putEntriesBatch(imported);
    const all = await getAllEntries();
    setEntries(all);
    setSelectedUuid(imported[0].uuid);
    setActiveView('timeline');
    showToast(`Imported ${imported.length} local .doentry ${imported.length === 1 ? 'file' : 'files'}.`);
  };

  const handleNewEntry = async () => {
    const fresh = createNewEntry();
    await putEntry(fresh);
    setEntries((prev) => [fresh, ...prev].sort((a, b) => b.creationDate.localeCompare(a.creationDate)));
    setSelectedUuid(fresh.uuid);
    setMobileShowEditor(true);
    if (activeView === 'settings') {
      setActiveView('timeline');
    }
  };

  const handleSaveEntry = async (updated: JournalEntry) => {
    setSaving(true);
    try {
      let savedEntry: JournalEntry;
      if (settings.mode === 'drive') {
        if (!driveService.isSignedIn()) {
          await driveService.signIn(settings.clientId);
          setIsDriveSignedIn(true);
        }
        const targetFolderId = settings.entriesFolderId || settings.rootFolderId;
        savedEntry = await driveService.saveEntryToDrive(updated, targetFolderId);
        showToast(`Saved directly to ${savedEntry.fileName} on Google Drive.`);
      } else {
        const xml = serializeDoentryXml(updated);
        savedEntry = {
          ...updated,
          rawXml: xml,
          modifiedTime: new Date().toISOString(),
        };
        await putEntry(savedEntry);
      }

      setEntries((prev) =>
        prev
          .map((e) => (e.uuid === savedEntry.uuid ? savedEntry : e))
          .sort((a, b) => b.creationDate.localeCompare(a.creationDate))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save entry.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entry: JournalEntry) => {
    try {
      if (settings.mode === 'drive' && entry.fileId) {
        if (!driveService.isSignedIn()) {
          await driveService.signIn(settings.clientId);
          setIsDriveSignedIn(true);
        }
        await driveService.trashEntryInDrive(entry);
        showToast(`Moved ${entry.fileName} to Google Drive Trash.`);
      } else {
        await deleteEntryFromDb(entry.uuid);
        showToast('Entry deleted.');
      }

      const remaining = entries.filter((e) => e.uuid !== entry.uuid);
      setEntries(remaining);
      setSelectedUuid(remaining[0]?.uuid ?? null);
      setMobileShowEditor(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete entry.';
      showToast(msg, 'error');
    }
  };

  const handleUploadPhoto = async (uuid: string, file: File) => {
    setUploadingPhoto(true);
    try {
      const existing = photosByUuid.get(uuid.toUpperCase());
      if (settings.mode === 'drive') {
        if (!driveService.isSignedIn()) {
          await driveService.signIn(settings.clientId);
          setIsDriveSignedIn(true);
        }
        const { photo, photosFolderId } = await driveService.uploadPhotoForEntry(
          uuid,
          file,
          settings.rootFolderId,
          settings.photosFolderId,
          existing
        );
        if (photosFolderId !== settings.photosFolderId) {
          const nextSettings = { ...settings, photosFolderId };
          setSettings(nextSettings);
          await saveSettings(nextSettings);
        }
        setPhotos((prev) => [...prev.filter((p) => p.uuid !== photo.uuid), photo]);
        showToast('Photo saved to Google Drive photos/ folder.');
      } else {
        const photo: PhotoRecord = {
          uuid: uuid.toUpperCase(),
          fileName: `${uuid.toUpperCase()}.jpg`,
          mimeType: file.type || 'image/jpeg',
          modifiedTime: new Date().toISOString(),
          blob: file,
        };
        await putPhoto(photo);
        setPhotos((prev) => [...prev.filter((p) => p.uuid !== photo.uuid), photo]);
        showToast('Photo attached.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload photo.';
      showToast(msg, 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePickFromGooglePhotos = async (uuid: string) => {
    if (!settings.clientId.trim()) {
      setActiveView('settings');
      showToast(
        'Enter your Google Cloud OAuth Client ID in Settings and enable Google Photos Picker API.',
        'error'
      );
      return;
    }

    setPickingGooglePhoto(true);
    try {
      const file = await pickPhotoFromGooglePhotos(settings.clientId);
      setIsDriveSignedIn(driveService.isSignedIn());
      if (file) {
        await handleUploadPhoto(uuid, file);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to pick photo from Google Photos.';
      showToast(msg, 'error');
    } finally {
      setPickingGooglePhoto(false);
    }
  };

  const handleRemovePhoto = async (photo: PhotoRecord) => {
    try {
      if (settings.mode === 'drive' && photo.fileId) {
        if (!driveService.isSignedIn()) {
          await driveService.signIn(settings.clientId);
          setIsDriveSignedIn(true);
        }
        await driveService.trashPhotoInDrive(photo);
      } else {
        await deletePhotoFromDb(photo.uuid);
      }
      setPhotos((prev) => prev.filter((p) => p.uuid !== photo.uuid));
      showToast('Photo removed.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove photo.';
      showToast(msg, 'error');
    }
  };

  const handleSelectEntry = (uuid: string) => {
    setSelectedUuid(uuid);
    setMobileShowEditor(true);
  };

  if (!booted) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-400 text-sm">
        Loading journal…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Desktop Left Sidebar */}
      <Sidebar
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          setMobileShowEditor(false);
        }}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        totalCount={entries.length}
        favoritesCount={favoritesCount}
        onThisDayCount={onThisDayPastCount}
        tagCounts={tagCounts}
        settings={settings}
        isDriveSignedIn={isDriveSignedIn}
        syncProgress={syncProgress}
        onSync={() => void handleConnectAndSync()}
        onNewEntry={() => void handleNewEntry()}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex min-w-0 min-h-0 relative overflow-hidden">
        {activeView === 'settings' ? (
          <div className="flex-1 min-w-0 h-full">
            <SettingsView
              settings={settings}
              isDriveSignedIn={isDriveSignedIn}
              syncProgress={syncProgress}
              entryCount={entries.length}
              photoCount={photos.length}
              onSaveSettings={handleSaveSettings}
              onConnectAndSync={(cid, fid) => handleConnectAndSync(cid, fid)}
              onSignOutDrive={handleSignOutDrive}
              onSwitchToDemo={handleSwitchToDemo}
              onImportLocalDoentries={handleImportLocalDoentries}
            />
          </div>
        ) : (
          <>
            {/* Middle Pane: Timeline / On This Day / Calendar */}
            <section
              className={`w-full md:w-80 lg:w-96 shrink-0 h-full ${
                mobileShowEditor ? 'hidden md:block' : 'block'
              }`}
            >
              {activeView === 'on-this-day' ? (
                <OnThisDayView
                  entries={entries}
                  photosByUuid={photosByUuid}
                  selectedUuid={selectedUuid}
                  onSelectEntry={handleSelectEntry}
                  onBlobLoaded={handleBlobLoaded}
                />
              ) : activeView === 'calendar' ? (
                <CalendarView
                  entries={entries}
                  photosByUuid={photosByUuid}
                  selectedUuid={selectedUuid}
                  onSelectEntry={handleSelectEntry}
                  onBlobLoaded={handleBlobLoaded}
                />
              ) : (
                <TimelineList
                  entries={filteredEntries}
                  photosByUuid={photosByUuid}
                  selectedUuid={selectedUuid}
                  onSelectEntry={handleSelectEntry}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  selectedTag={selectedTag}
                  onClearTag={() => setSelectedTag(null)}
                  favoritesOnly={activeView === 'favorites'}
                  onThisDayPastCount={onThisDayPastCount}
                  onOpenOnThisDay={() => setActiveView('on-this-day')}
                  onBlobLoaded={handleBlobLoaded}
                />
              )}
            </section>

            {/* Right Pane: Entry Reader / Editor */}
            <section
              className={`flex-1 min-w-0 h-full ${
                mobileShowEditor ? 'block' : 'hidden md:block'
              }`}
            >
              {selectedEntry ? (
                <EntryEditor
                  entry={selectedEntry}
                  photo={photosByUuid.get(selectedEntry.uuid)}
                  allTags={allTags}
                  mode={settings.mode}
                  saving={saving}
                  uploadingPhoto={uploadingPhoto}
                  pickingGooglePhoto={pickingGooglePhoto}
                  onSave={handleSaveEntry}
                  onDelete={handleDeleteEntry}
                  onUploadPhoto={handleUploadPhoto}
                  onPickFromGooglePhotos={handlePickFromGooglePhotos}
                  onRemovePhoto={handleRemovePhoto}
                  onBack={() => setMobileShowEditor(false)}
                  onBlobLoaded={handleBlobLoaded}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                  <BookOpen className="w-10 h-10 opacity-40" />
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Select an entry or create a new one
                  </p>
                  <button
                    onClick={() => void handleNewEntry()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold shadow-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    New Entry
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {/* Mobile Floating New Entry Button */}
        {!mobileShowEditor && activeView !== 'settings' && (
          <button
            onClick={() => void handleNewEntry()}
            aria-label="New Entry"
            className="md:hidden fixed right-5 bottom-20 z-30 w-14 h-14 rounded-full bg-sky-500 hover:bg-sky-600 active:scale-95 text-white shadow-lg flex items-center justify-center transition cursor-pointer"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Pixel / Android PWA) */}
      {!mobileShowEditor && (
        <nav className="md:hidden shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur safe-bottom grid grid-cols-5">
          {[
            { id: 'timeline' as const, label: 'Journal', icon: BookOpen },
            { id: 'on-this-day' as const, label: 'On Day', icon: History, badge: onThisDayPastCount },
            { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
            { id: 'favorites' as const, label: 'Starred', icon: Star },
            { id: 'settings' as const, label: 'Drive', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedTag(null);
                  setActiveView(item.id);
                }}
                className={`relative py-2.5 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                  active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="absolute top-1.5 right-3 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      )}

      {/* Toast Banner */}
      {toast && (
        <div
          className={`fixed bottom-20 md:bottom-5 right-4 left-4 md:left-auto md:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-medium ${
            toast.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-slate-900 dark:bg-slate-800 border-slate-700 text-white'
          }`}
        >
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
