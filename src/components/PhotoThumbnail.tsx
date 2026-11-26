import { memo, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { PhotoRecord } from '../types';
import { driveService } from '../lib/googleDrive';
import { photoCache } from '../lib/photoCache';

interface PhotoThumbnailProps {
  photo?: PhotoRecord;
  className?: string;
  alt?: string;
  fit?: 'cover' | 'contain';
  eager?: boolean;
  onClick?: (resolvedUrl: string) => void;
  /** @deprecated No longer needed with photoCache; kept optional for callsite compatibility */
  onBlobLoaded?: (uuid: string, blob: Blob) => void;
}

export const PhotoThumbnail = memo(function PhotoThumbnail({
  photo,
  className = '',
  alt = 'Journal photo',
  fit = 'cover',
  eager = false,
  onClick,
}: PhotoThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(
    () => eager || (photo ? Boolean(photoCache.getCachedUrl(photo.uuid, photo.modifiedTime)) : false)
  );
  const [url, setUrl] = useState<string | null>(() =>
    photo ? photoCache.getCachedUrl(photo.uuid, photo.modifiedTime) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const retriedRef = useRef(false);

  // Lazy-trigger photo loading only when scrolled near viewport (unless eager or already cached)
  useEffect(() => {
    if (!photo) return;
    const cached = photoCache.getCachedUrl(photo.uuid, photo.modifiedTime);
    if (cached) {
      setUrl(cached);
      setInView(true);
      setError(false);
      return;
    }
    if (eager || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [photo?.uuid, photo?.modifiedTime, eager]);

  useEffect(() => {
    let active = true;
    retriedRef.current = false;

    if (!photo) {
      setUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    const cached = photoCache.getCachedUrl(photo.uuid, photo.modifiedTime);
    if (cached) {
      setUrl(cached);
      setLoading(false);
      setError(false);
      return;
    }

    if (!inView) return;

    const load = async () => {
      setLoading(true);
      setError(false);
      const resolved = await photoCache.resolveUrl(photo, false);
      if (!active) return;
      setLoading(false);
      if (resolved) {
        setUrl(resolved);
      } else {
        setUrl(null);
        setError(true);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [photo?.uuid, photo?.fileId, photo?.modifiedTime, photo?.data, photo?.blob, inView]);

  const handleImgError = async () => {
    if (!photo) return;
    // Self-heal once: if a stale/corrupted cached blob failed to decode, re-download from Drive
    if (!retriedRef.current && photo.fileId && driveService.isSignedIn()) {
      retriedRef.current = true;
      setLoading(true);
      const fresh = await photoCache.resolveUrl(photo, true);
      setLoading(false);
      if (fresh) {
        setUrl(fresh);
        setError(false);
        return;
      }
    }
    photoCache.evict(photo.uuid);
    setUrl(null);
    setError(true);
  };

  if (!photo) return null;

  if (loading) {
    return (
      <div
        ref={containerRef}
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 animate-pulse ${className}`}
      >
        <ImageIcon className="w-5 h-5 text-slate-400" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div
        ref={containerRef}
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 ${className}`}
        title={
          driveService.isSignedIn()
            ? 'Photo unavailable or unsupported format'
            : 'Reconnect Google Drive to load photo'
        }
      >
        <ImageIcon className="w-5 h-5 opacity-70" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => void handleImgError()}
      onClick={onClick ? () => onClick(url) : undefined}
      className={`${fit === 'contain' ? 'object-contain' : 'object-cover'} ${onClick ? 'cursor-zoom-in' : ''} ${className}`}
    />
  );
});
