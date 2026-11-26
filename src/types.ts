export interface EntryLocation {
  placeName?: string;
  locality?: string;
  administrativeArea?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface EntryWeather {
  celsius?: string;
  fahrenheit?: string;
  description?: string;
  iconName?: string;
}

export interface JournalEntry {
  uuid: string;
  creationDate: string; // ISO-8601 UTC string, e.g. 2024-11-22T18:30:00Z
  entryText: string;
  starred: boolean;
  tags: string[];
  timeZone: string;
  location?: EntryLocation;
  weather?: EntryWeather;
  rawXml: string;
  fileId?: string;
  fileName: string;
  modifiedTime?: string;
  md5Checksum?: string;
  pendingSync?: boolean;
}

export interface PhotoRecord {
  uuid: string;
  fileId?: string;
  fileName: string;
  mimeType: string;
  modifiedTime?: string;
  blob?: Blob;
  /** Raw bytes stored in IndexedDB (avoids Safari/WebKit stale IndexedDB Blob bugs). */
  data?: ArrayBuffer;
}

export type AppMode = 'drive' | 'demo';
export type FolderLayout = 'standard' | 'flat';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface PinnedMilestone {
  entryUuid: string;
  label?: string;
  category?: string;
  /** Optional custom photo key stored in IndexedDB `photos` store (overrides entry photo on Polaroid only). */
  customPhotoKey?: string;
}

export interface PersonProfile {
  id: string;
  name: string;
  aliases: string[];
  role: 'partner' | 'child' | 'family' | 'friend' | 'other';
  accent: 'rose' | 'sky' | 'amber' | 'emerald' | 'violet';
  /** Optional YYYY-MM-DD cutoff — entries earlier than this are excluded from this person's timeline. */
  startDate?: string;
  /** When true, timeline shows curated milestones only (no regex fallback clutter). */
  aiCurated?: boolean;
  pinnedMilestones: PinnedMilestone[];
  hiddenEntryUuids: string[];
}

export interface AppSettings {
  clientId: string;
  rootFolderId: string;
  mode: AppMode;
  entriesFolderId?: string;
  photosFolderId?: string;
  timelineFolderId?: string;
  layoutType?: FolderLayout;
  lastSyncAt?: string;
  theme?: ThemePreference;
  geminiApiKey?: string;
  people?: PersonProfile[];
}

export interface SyncProgress {
  phase: 'idle' | 'discovering' | 'listing' | 'downloading' | 'photos' | 'done' | 'error';
  completed: number;
  total: number;
  message: string;
}

export type ActiveView =
  | 'timeline'
  | 'on-this-day'
  | 'calendar'
  | 'photos'
  | 'people'
  | 'favorites'
  | 'settings';
