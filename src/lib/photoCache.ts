import type { PhotoRecord } from '../types';
import { driveService } from './googleDrive';
import { putPhoto } from './db';

const MAX_CONCURRENT_DOWNLOADS = 4;

export function inferImageMimeType(fileName: string, rawMime?: string): string {
  if (rawMime && rawMime.startsWith('image/') && rawMime !== 'image/heic' && rawMime !== 'image/heif') {
    return rawMime;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

interface CacheEntry {
  url: string;
  modifiedTime?: string;
}

class PhotoUrlCache {
  private urls = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<string | null>>();
  private activeDownloads = 0;
  private queue: Array<() => void> = [];

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.activeDownloads++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.activeDownloads--;
            const next = this.queue.shift();
            if (next) next();
          });
      };

      if (this.activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  getCachedUrl(uuid: string, modifiedTime?: string): string | null {
    const key = uuid.toUpperCase();
    const hit = this.urls.get(key);
    if (!hit) return null;
    if (modifiedTime && hit.modifiedTime && hit.modifiedTime !== modifiedTime) {
      this.evict(key);
      return null;
    }
    return hit.url;
  }

  setFromBlob(uuid: string, blob: Blob, modifiedTime?: string): string {
    const key = uuid.toUpperCase();
    const prev = this.urls.get(key);
    if (prev) URL.revokeObjectURL(prev.url);
    const url = URL.createObjectURL(blob);
    this.urls.set(key, { url, modifiedTime });
    return url;
  }

  evict(uuid: string): void {
    const key = uuid.toUpperCase();
    const prev = this.urls.get(key);
    if (prev) {
      URL.revokeObjectURL(prev.url);
      this.urls.delete(key);
    }
  }

  clearAll(): void {
    for (const entry of this.urls.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.urls.clear();
    this.inflight.clear();
  }

  async resolveUrl(photo: PhotoRecord, forceRedownload = false): Promise<string | null> {
    const key = photo.uuid.toUpperCase();

    if (!forceRedownload) {
      const cached = this.getCachedUrl(key, photo.modifiedTime);
      if (cached) return cached;
    } else {
      this.evict(key);
    }

    const existingPromise = this.inflight.get(key);
    if (existingPromise && !forceRedownload) {
      return existingPromise;
    }

    const promise = (async (): Promise<string | null> => {
      try {
        const mime = inferImageMimeType(photo.fileName, photo.mimeType);

        // 1. Prefer ArrayBuffer stored in IndexedDB (immune to Safari/WebKit Blob eviction bug)
        if (!forceRedownload && photo.data && photo.data.byteLength > 0) {
          const blob = new Blob([photo.data], { type: mime });
          return this.setFromBlob(key, blob, photo.modifiedTime);
        }

        // 2. Fallback to legacy Blob stored in IndexedDB (validate it is still readable)
        if (!forceRedownload && photo.blob && photo.blob.size > 0) {
          try {
            const buf = await photo.blob.arrayBuffer();
            if (buf.byteLength > 0) {
              const safeBlob = new Blob([buf], { type: mime });
              // Quietly migrate to ArrayBuffer in IndexedDB for future reloads
              void putPhoto({ ...photo, data: buf, blob: undefined, mimeType: mime }).catch(() => {});
              return this.setFromBlob(key, safeBlob, photo.modifiedTime);
            }
          } catch {
            // Stale/unreadable WebKit Blob — fall through to Drive download
          }
        }

        // 3. Download from Google Drive with concurrency throttling
        if (photo.fileId && driveService.isSignedIn()) {
          const blob = await this.enqueue(() =>
            driveService.downloadPhotoBlob(photo, forceRedownload)
          );
          if (blob && blob.size > 0) {
            return this.setFromBlob(key, blob, photo.modifiedTime);
          }
        }

        return null;
      } catch {
        return null;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }
}

export const photoCache = new PhotoUrlCache();
