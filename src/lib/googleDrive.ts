import type { FolderLayout, JournalEntry, PhotoRecord, SyncProgress } from '../types';
import { parseDoentryXml, serializeDoentryXml } from './doentry';
import {
  deleteEntryFromDb,
  deletePhotoFromDb,
  getAllEntries,
  getAllPhotos,
  putEntriesBatch,
  putEntry,
  putPhoto,
  putPhotosBatch,
} from './db';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const AUTH_STORAGE_KEY = 'daylight-drive-auth';

interface StoredAuth {
  accessToken: string;
  expiresAt: number;
  userEmail?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
          };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

/**
 * Extracts a Google Drive folder ID from either a full Drive URL or a raw ID.
 */
export function extractFolderId(input: string): string {
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return trimmed;
}

class GoogleDriveService {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private userEmail: string | undefined = undefined;

  constructor() {
    this.restoreSession();
  }

  private restoreSession(): void {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredAuth>;
      if (parsed.userEmail) this.userEmail = parsed.userEmail;
      if (parsed.accessToken && parsed.expiresAt && Date.now() < parsed.expiresAt - 30_000) {
        this.accessToken = parsed.accessToken;
        this.expiresAt = parsed.expiresAt;
      }
    } catch {
      // ignore malformed storage
    }
  }

  private persistSession(): void {
    try {
      if (this.accessToken && this.expiresAt > 0) {
        const payload: StoredAuth = {
          accessToken: this.accessToken,
          expiresAt: this.expiresAt,
          userEmail: this.userEmail,
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
      } else if (this.userEmail) {
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ accessToken: '', expiresAt: 0, userEmail: this.userEmail })
        );
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }

  isSignedIn(): boolean {
    return Boolean(this.accessToken) && Date.now() < this.expiresAt - 30_000;
  }

  getToken(): string | null {
    return this.isSignedIn() ? this.accessToken : null;
  }

  getUserEmail(): string | undefined {
    return this.userEmail;
  }

  signOut(): void {
    if (this.accessToken && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(this.accessToken);
      } catch {
        // ignore revoke errors
      }
    }
    this.accessToken = null;
    this.expiresAt = 0;
    this.userEmail = undefined;
    this.persistSession();
  }

  private async fetchAndSaveUserEmail(): Promise<void> {
    if (this.userEmail || !this.accessToken) return;
    try {
      const res = await fetch(`${DRIVE_API}/about?fields=user(emailAddress)`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { user?: { emailAddress?: string } };
        if (data.user?.emailAddress) {
          this.userEmail = data.user.emailAddress;
          this.persistSession();
        }
      }
    } catch {
      // non-fatal
    }
  }

  async signIn(clientId: string, prompt: '' | 'consent' | 'select_account' = ''): Promise<string> {
    if (!clientId.trim()) {
      throw new Error('Please enter your Google Cloud OAuth Client ID in Settings first.');
    }

    // Reuse still-valid persisted token without opening a login popup
    if (prompt === '' && this.isSignedIn() && this.accessToken) {
      return this.accessToken;
    }

    // Wait briefly if GIS script is still loading
    if (!window.google?.accounts?.oauth2) {
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!window.google?.accounts?.oauth2) {
      throw new Error(
        'Google Identity Services script failed to load. Check your internet connection or ad blocker.'
      );
    }

    return new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId.trim(),
        scope: DRIVE_SCOPE,
        hint: this.userEmail,
        callback: (resp) => {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          this.accessToken = resp.access_token;
          this.expiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
          this.persistSession();
          void this.fetchAndSaveUserEmail();
          resolve(resp.access_token);
        },
        error_callback: (err) => {
          reject(new Error(err.message || err.type || 'Google sign-in popup was closed.'));
        },
      });
      client.requestAccessToken({ prompt, hint: this.userEmail });
    });
  }

  private async authedFetch(url: string, init?: RequestInit): Promise<Response> {
    if (!this.isSignedIn()) {
      throw new Error('Google Drive session expired. Please click "Reconnect Drive" to continue.');
    }
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${this.accessToken}`);
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401) {
      this.accessToken = null;
      this.expiresAt = 0;
      this.persistSession();
      throw new Error('Google Drive session expired. Please click "Reconnect Drive" to continue.');
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Google Drive API error (${res.status}): ${errText || res.statusText}`);
    }
    return res;
  }

  private async listFilesInFolder(
    folderId: string,
    extraQuery = ''
  ): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    const baseQ = `'${folderId}' in parents and trashed = false${extraQuery ? ` and ${extraQuery}` : ''}`;

    do {
      const params = new URLSearchParams({
        q: baseQ,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, size)',
        pageSize: '1000',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await this.authedFetch(`${DRIVE_API}/files?${params.toString()}`);
      const data = (await res.json()) as { nextPageToken?: string; files?: DriveFile[] };
      if (data.files) {
        files.push(...data.files);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return files;
  }

  /**
   * Auto-detects whether the Drive folder uses:
   * - Standard Day One / Journaley structure (`entries/` + `photos/`, or `Journal.dayone/entries/`)
   * - Flat folder containing `.doentry` files directly
   */
  async discoverFolders(rootFolderId: string): Promise<{
    entriesFolderId: string;
    photosFolderId?: string;
    layoutType: FolderLayout;
  }> {
    const topLevelFolders = await this.listFilesInFolder(
      rootFolderId,
      "mimeType = 'application/vnd.google-apps.folder'"
    );

    const findByName = (list: DriveFile[], name: string) =>
      list.find((f) => f.name.toLowerCase() === name.toLowerCase());

    const entriesDir = findByName(topLevelFolders, 'entries');
    const photosDir = findByName(topLevelFolders, 'photos');

    if (entriesDir) {
      return {
        entriesFolderId: entriesDir.id,
        photosFolderId: photosDir?.id,
        layoutType: 'standard',
      };
    }

    // Check for a nested *.dayone package folder (e.g. Journal.dayone)
    const dayonePkg = topLevelFolders.find((f) => f.name.toLowerCase().endsWith('.dayone'));
    if (dayonePkg) {
      const pkgFolders = await this.listFilesInFolder(
        dayonePkg.id,
        "mimeType = 'application/vnd.google-apps.folder'"
      );
      const nestedEntries = findByName(pkgFolders, 'entries');
      const nestedPhotos = findByName(pkgFolders, 'photos');
      if (nestedEntries) {
        return {
          entriesFolderId: nestedEntries.id,
          photosFolderId: nestedPhotos?.id,
          layoutType: 'standard',
        };
      }
    }

    // Otherwise treat root folder as flat `.doentry` directory
    return {
      entriesFolderId: rootFolderId,
      photosFolderId: photosDir?.id,
      layoutType: 'flat',
    };
  }

  async ensurePhotosFolder(
    rootFolderId: string,
    existingPhotosFolderId?: string
  ): Promise<string> {
    if (existingPhotosFolderId) return existingPhotosFolderId;

    const folders = await this.listFilesInFolder(
      rootFolderId,
      "mimeType = 'application/vnd.google-apps.folder' and name = 'photos'"
    );
    if (folders.length > 0) return folders[0].id;

    const res = await this.authedFetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'photos',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId],
      }),
    });
    const created = (await res.json()) as DriveFile;
    return created.id;
  }

  /**
   * Incrementally syncs all `.doentry` files and photo metadata from Google Drive into IndexedDB.
   */
  async syncFromDrive(
    rootFolderId: string,
    onProgress?: (progress: SyncProgress) => void
  ): Promise<{
    entriesFolderId: string;
    photosFolderId?: string;
    layoutType: FolderLayout;
    syncedCount: number;
    totalCount: number;
  }> {
    onProgress?.({
      phase: 'discovering',
      completed: 0,
      total: 0,
      message: 'Inspecting Google Drive folder layout…',
    });

    const { entriesFolderId, photosFolderId, layoutType } =
      await this.discoverFolders(rootFolderId);

    // Push any offline-saved local changes before pulling from Drive
    const preSyncEntries = await getAllEntries();
    const pendingEntries = preSyncEntries.filter((e) => e.pendingSync);
    if (pendingEntries.length > 0) {
      for (let i = 0; i < pendingEntries.length; i++) {
        onProgress?.({
          phase: 'downloading',
          completed: i,
          total: pendingEntries.length,
          message: `Uploading offline edits (${i + 1}/${pendingEntries.length})…`,
        });
        try {
          await this.saveEntryToDrive(pendingEntries[i], entriesFolderId);
        } catch (err) {
          console.warn(`Could not upload pending entry ${pendingEntries[i].fileName}:`, err);
        }
      }
    }

    onProgress?.({
      phase: 'listing',
      completed: 0,
      total: 0,
      message: 'Listing .doentry files…',
    });

    const allFiles = await this.listFilesInFolder(entriesFolderId);
    const doentryFiles = allFiles.filter((f) => f.name.toLowerCase().endsWith('.doentry'));

    const existingEntries = await getAllEntries();
    const byFileId = new Map<string, JournalEntry>();
    const byFileName = new Map<string, JournalEntry>();
    for (const e of existingEntries) {
      if (e.fileId) byFileId.set(e.fileId, e);
      byFileName.set(e.fileName.toLowerCase(), e);
    }

    const remoteIds = new Set(doentryFiles.map((f) => f.id));
    const toDownload: DriveFile[] = [];

    for (const file of doentryFiles) {
      const cached = byFileId.get(file.id) ?? byFileName.get(file.name.toLowerCase());
      if (cached?.pendingSync) {
        // Keep local offline edit intact until it uploads cleanly
        continue;
      }
      const unchanged =
        cached &&
        cached.fileId === file.id &&
        ((file.md5Checksum && cached.md5Checksum === file.md5Checksum) ||
          (!file.md5Checksum && cached.modifiedTime === file.modifiedTime));
      if (!unchanged) {
        toDownload.push(file);
      }
    }

    // Remove local cached entries that were deleted on Drive (never delete pendingSync entries)
    for (const existing of existingEntries) {
      if (existing.pendingSync) continue;
      if (!existing.fileId || !remoteIds.has(existing.fileId)) {
        await deleteEntryFromDb(existing.uuid);
      }
    }

    // Download new/updated .doentry files with a concurrency pool
    let completed = 0;
    const total = toDownload.length;
    const downloadedEntries: JournalEntry[] = [];
    const CONCURRENCY = 8;

    if (total > 0) {
      onProgress?.({
        phase: 'downloading',
        completed: 0,
        total,
        message: `Downloading ${total} ${total === 1 ? 'entry' : 'entries'}…`,
      });

      let cursor = 0;
      const worker = async () => {
        while (cursor < toDownload.length) {
          const file = toDownload[cursor++];
          try {
            const res = await this.authedFetch(
              `${DRIVE_API}/files/${file.id}?alt=media&supportsAllDrives=true`
            );
            const xml = await res.text();
            const parsed = parseDoentryXml(xml, {
              fileId: file.id,
              fileName: file.name,
              modifiedTime: file.modifiedTime,
              md5Checksum: file.md5Checksum,
            });
            downloadedEntries.push(parsed);
          } catch (err) {
            console.warn(`Skipped ${file.name}:`, err);
          } finally {
            completed++;
            if (completed % 5 === 0 || completed === total) {
              onProgress?.({
                phase: 'downloading',
                completed,
                total,
                message: `Downloading entries (${completed}/${total})…`,
              });
            }
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));
      await putEntriesBatch(downloadedEntries);
    }

    // Index photos folder metadata (blobs are lazy-loaded when viewed)
    if (photosFolderId) {
      onProgress?.({
        phase: 'photos',
        completed: 0,
        total: 0,
        message: 'Indexing photos folder…',
      });
      const photoFiles = await this.listFilesInFolder(photosFolderId);
      const existingPhotos = await getAllPhotos();
      const existingMap = new Map(existingPhotos.map((p) => [p.uuid, p]));
      const remotePhotoUuids = new Set<string>();
      const photoRecords: PhotoRecord[] = [];

      for (const f of photoFiles) {
        if (!f.mimeType.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)) {
          continue;
        }
        const uuid = f.name.replace(/\.[^.]+$/, '').toUpperCase();
        remotePhotoUuids.add(uuid);
        const prev = existingMap.get(uuid);
        const sameMod = Boolean(prev && prev.modifiedTime === f.modifiedTime);
        photoRecords.push({
          uuid,
          fileId: f.id,
          fileName: f.name,
          mimeType: f.mimeType || 'image/jpeg',
          modifiedTime: f.modifiedTime,
          data: sameMod ? prev?.data : undefined,
          blob: sameMod && !prev?.data ? prev?.blob : undefined,
        });
      }

      if (photoRecords.length > 0) {
        await putPhotosBatch(photoRecords);
      }

      for (const prev of existingPhotos) {
        if (prev.uuid.startsWith('MILESTONE_')) continue;
        if (!prev.fileId || !remotePhotoUuids.has(prev.uuid)) {
          await deletePhotoFromDb(prev.uuid);
        }
      }
    } else {
      const existingPhotos = await getAllPhotos();
      for (const prev of existingPhotos) {
        if (prev.uuid.startsWith('MILESTONE_')) continue;
        if (!prev.fileId) {
          await deletePhotoFromDb(prev.uuid);
        }
      }
    }

    onProgress?.({
      phase: 'done',
      completed: total,
      total,
      message: `Synced ${doentryFiles.length} entries`,
    });

    return {
      entriesFolderId,
      photosFolderId,
      layoutType,
      syncedCount: downloadedEntries.length,
      totalCount: doentryFiles.length,
    };
  }

  /**
   * Saves an entry directly to its `.doentry` file in Google Drive (updating in place if it exists,
   * or creating `<UUID>.doentry` if it's a new entry).
   */
  async saveEntryToDrive(
    entry: JournalEntry,
    entriesFolderId: string
  ): Promise<JournalEntry> {
    const xml = serializeDoentryXml(entry);
    let driveMeta: DriveFile;

    if (entry.fileId) {
      const res = await this.authedFetch(
        `${DRIVE_UPLOAD_API}/files/${entry.fileId}?uploadType=media&supportsAllDrives=true&fields=id,name,modifiedTime,md5Checksum`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
          body: xml,
        }
      );
      driveMeta = (await res.json()) as DriveFile;
    } else {
      const boundary = `daylight_${Date.now()}`;
      const metadata = JSON.stringify({
        name: entry.fileName,
        parents: [entriesFolderId],
        mimeType: 'application/xml',
      });
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/xml; charset=UTF-8\r\n\r\n` +
        `${xml}\r\n` +
        `--${boundary}--`;

      const res = await this.authedFetch(
        `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,modifiedTime,md5Checksum`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        }
      );
      driveMeta = (await res.json()) as DriveFile;
    }

    const updated: JournalEntry = {
      ...entry,
      rawXml: xml,
      fileId: driveMeta.id,
      fileName: driveMeta.name || entry.fileName,
      modifiedTime: driveMeta.modifiedTime,
      md5Checksum: driveMeta.md5Checksum,
      pendingSync: false,
    };
    await putEntry(updated);
    return updated;
  }

  /**
   * Moves an entry's `.doentry` file to Google Drive Trash (reversible) and removes from local cache.
   */
  async trashEntryInDrive(entry: JournalEntry): Promise<void> {
    if (entry.fileId) {
      await this.authedFetch(`${DRIVE_API}/files/${entry.fileId}?supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    }
    await deleteEntryFromDb(entry.uuid);
  }

  /**
   * Downloads and caches an entry's photo bytes from Google Drive as an ArrayBuffer
   * (avoiding Safari/WebKit's stale IndexedDB Blob issue).
   */
  async downloadPhotoBlob(photo: PhotoRecord, forceRedownload = false): Promise<Blob> {
    const mime =
      photo.mimeType && photo.mimeType.startsWith('image/')
        ? photo.mimeType
        : photo.fileName.toLowerCase().endsWith('.png')
          ? 'image/png'
          : photo.fileName.toLowerCase().endsWith('.webp')
            ? 'image/webp'
            : photo.fileName.toLowerCase().endsWith('.gif')
              ? 'image/gif'
              : 'image/jpeg';

    if (!forceRedownload && photo.data && photo.data.byteLength > 0) {
      return new Blob([photo.data], { type: mime });
    }
    if (!photo.fileId) throw new Error('Photo has no Google Drive file ID.');

    const res = await this.authedFetch(
      `${DRIVE_API}/files/${photo.fileId}?alt=media&supportsAllDrives=true`
    );
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error('Downloaded empty photo from Google Drive.');
    }
    const contentType = res.headers.get('content-type');
    const resolvedMime =
      contentType && contentType.startsWith('image/') ? contentType.split(';')[0].trim() : mime;

    await putPhoto({
      ...photo,
      mimeType: resolvedMime,
      data: buffer,
      blob: undefined,
    });
    return new Blob([buffer], { type: resolvedMime });
  }

  /**
   * Uploads or replaces a photo in the `photos/` folder named `<UUID>.jpg` (or original extension).
   */
  async uploadPhotoForEntry(
    uuid: string,
    file: File,
    rootFolderId: string,
    photosFolderId?: string,
    existingPhoto?: PhotoRecord
  ): Promise<{ photo: PhotoRecord; photosFolderId: string }> {
    const targetPhotosFolderId = await this.ensurePhotosFolder(rootFolderId, photosFolderId);
    const ext = file.name.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const fileName = `${uuid.toUpperCase()}.${ext}`;
    const mimeType = file.type || (ext === 'png' ? 'image/png' : 'image/jpeg');

    let driveMeta: DriveFile;

    if (existingPhoto?.fileId) {
      const res = await this.authedFetch(
        `${DRIVE_UPLOAD_API}/files/${existingPhoto.fileId}?uploadType=media&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': mimeType },
          body: file,
        }
      );
      driveMeta = (await res.json()) as DriveFile;
    } else {
      const metadata = JSON.stringify({
        name: fileName,
        parents: [targetPhotosFolderId],
        mimeType,
      });
      const form = new FormData();
      form.append('metadata', new Blob([metadata], { type: 'application/json' }));
      form.append('file', file);

      const res = await this.authedFetch(
        `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime`,
        {
          method: 'POST',
          body: form,
        }
      );
      driveMeta = (await res.json()) as DriveFile;
    }

    const data = await file.arrayBuffer();
    const photoRecord: PhotoRecord = {
      uuid: uuid.toUpperCase(),
      fileId: driveMeta.id,
      fileName: driveMeta.name || fileName,
      mimeType: driveMeta.mimeType || mimeType,
      modifiedTime: driveMeta.modifiedTime,
      data,
    };
    await putPhoto(photoRecord);
    return { photo: photoRecord, photosFolderId: targetPhotosFolderId };
  }

  async trashPhotoInDrive(photo: PhotoRecord): Promise<void> {
    if (photo.fileId) {
      await this.authedFetch(`${DRIVE_API}/files/${photo.fileId}?supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    }
    await deletePhotoFromDb(photo.uuid);
  }
}

export const driveService = new GoogleDriveService();
