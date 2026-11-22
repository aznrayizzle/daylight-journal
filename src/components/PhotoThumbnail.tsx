import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { PhotoRecord } from '../types';
import { driveService } from '../lib/googleDrive';

interface PhotoThumbnailProps {
  photo?: PhotoRecord;
  className?: string;
  alt?: string;
  onClick?: () => void;
  onBlobLoaded?: (uuid: string, blob: Blob) => void;
}

export function PhotoThumbnail({
  photo,
  className = '',
  alt = 'Journal photo',
  onClick,
  onBlobLoaded,
}: PhotoThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!photo) {
      setUrl(null);
      return;
    }

    const load = async () => {
      try {
        setError(false);
        let blob = photo.blob;
        if (!blob && photo.fileId && driveService.isSignedIn()) {
          setLoading(true);
          blob = await driveService.downloadPhotoBlob(photo);
          if (active && blob) {
            onBlobLoaded?.(photo.uuid, blob);
          }
        }
        if (active && blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo?.uuid, photo?.fileId, photo?.blob, photo?.modifiedTime]);

  if (!photo) return null;

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 animate-pulse ${className}`}
      >
        <ImageIcon className="w-5 h-5 text-slate-400" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 ${className}`}
        title={
          driveService.isSignedIn()
            ? 'Could not load photo'
            : 'Reconnect Google Drive to load photo'
        }
      >
        <ImageIcon className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onClick={onClick}
      className={`object-cover ${onClick ? 'cursor-zoom-in' : ''} ${className}`}
    />
  );
}
