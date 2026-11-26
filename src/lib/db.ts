import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, JournalEntry, PersonProfile, PhotoRecord } from '../types';

export const DEFAULT_FOLDER_ID = '';

export const DEFAULT_PEOPLE: PersonProfile[] = [
  {
    id: 'lucy',
    name: 'Lucy',
    aliases: [],
    role: 'partner',
    accent: 'rose',
    pinnedMilestones: [],
    hiddenEntryUuids: [],
  },
  {
    id: 'cayden',
    name: 'Cayden',
    aliases: [],
    role: 'child',
    accent: 'sky',
    pinnedMilestones: [],
    hiddenEntryUuids: [],
  },
];

interface JournalDB extends DBSchema {
  entries: {
    key: string; // uuid
    value: JournalEntry;
    indexes: { 'by-date': string };
  };
  photos: {
    key: string; // uuid
    value: PhotoRecord;
  };
  meta: {
    key: string;
    value: AppSettings;
  };
}

let dbPromise: Promise<IDBPDatabase<JournalDB>> | null = null;

function getDb(): Promise<IDBPDatabase<JournalDB>> {
  if (!dbPromise) {
    dbPromise = openDB<JournalDB>('daylight-journal-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('entries')) {
          const entryStore = db.createObjectStore('entries', { keyPath: 'uuid' });
          entryStore.createIndex('by-date', 'creationDate');
        }
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'uuid' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const saved = await db.get('meta', 'settings');
  return {
    clientId: saved?.clientId ?? '',
    rootFolderId: saved?.rootFolderId ?? DEFAULT_FOLDER_ID,
    mode: saved?.mode ?? 'demo',
    entriesFolderId: saved?.entriesFolderId,
    photosFolderId: saved?.photosFolderId,
    layoutType: saved?.layoutType,
    lastSyncAt: saved?.lastSyncAt,
    theme: saved?.theme ?? 'system',
    people: saved?.people && saved.people.length > 0 ? saved.people : DEFAULT_PEOPLE,
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('meta', settings, 'settings');
}

export async function getAllEntries(): Promise<JournalEntry[]> {
  const db = await getDb();
  const list = await db.getAll('entries');
  return list.sort((a, b) => b.creationDate.localeCompare(a.creationDate));
}

export async function putEntry(entry: JournalEntry): Promise<void> {
  const db = await getDb();
  await db.put('entries', entry);
}

export async function putEntriesBatch(entries: JournalEntry[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('entries', 'readwrite');
  for (const entry of entries) {
    tx.store.put(entry);
  }
  await tx.done;
}

export async function deleteEntryFromDb(uuid: string): Promise<void> {
  const db = await getDb();
  await db.delete('entries', uuid);
}

export async function clearEntriesAndPhotos(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['entries', 'photos'], 'readwrite');
  await tx.objectStore('entries').clear();
  await tx.objectStore('photos').clear();
  await tx.done;
}

export async function getAllPhotos(): Promise<PhotoRecord[]> {
  const db = await getDb();
  return db.getAll('photos');
}

export async function getPhoto(uuid: string): Promise<PhotoRecord | undefined> {
  const db = await getDb();
  return db.get('photos', uuid.toUpperCase());
}

export async function putPhoto(photo: PhotoRecord): Promise<void> {
  const db = await getDb();
  await db.put('photos', { ...photo, uuid: photo.uuid.toUpperCase() });
}

export async function putPhotosBatch(photos: PhotoRecord[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('photos', 'readwrite');
  for (const p of photos) {
    tx.store.put({ ...p, uuid: p.uuid.toUpperCase() });
  }
  await tx.done;
}

export async function deletePhotoFromDb(uuid: string): Promise<void> {
  const db = await getDb();
  await db.delete('photos', uuid.toUpperCase());
}
