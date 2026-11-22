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
}

export interface PhotoRecord {
  uuid: string;
  fileId?: string;
  fileName: string;
  mimeType: string;
  modifiedTime?: string;
  blob?: Blob;
}

export type AppMode = 'drive' | 'demo';
export type FolderLayout = 'standard' | 'flat';

export interface AppSettings {
  clientId: string;
  rootFolderId: string;
  mode: AppMode;
  entriesFolderId?: string;
  photosFolderId?: string;
  layoutType?: FolderLayout;
  lastSyncAt?: string;
}

export interface SyncProgress {
  phase: 'idle' | 'discovering' | 'listing' | 'downloading' | 'photos' | 'done' | 'error';
  completed: number;
  total: number;
  message: string;
}

export type ActiveView = 'timeline' | 'on-this-day' | 'calendar' | 'favorites' | 'settings';
