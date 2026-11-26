import { useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  Calendar,
  Check,
  CloudOff,
  CloudSun,
  Eye,
  FileCode2,
  Heading2,
  ImagePlus,
  Images,
  Italic,
  List,
  Loader2,
  LocateFixed,
  MapPin,
  Pencil,
  Quote,
  Save,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { AppMode, EntryLocation, JournalEntry, PhotoRecord } from '../types';
import {
  countWords,
  datetimeLocalToIso,
  formatFullDate,
  formatTime,
  isoToDatetimeLocal,
} from '../lib/dateUtils';
import { MarkdownPreview } from '../lib/markdown';
import { PhotoThumbnail } from './PhotoThumbnail';

export interface EntryEditorHandle {
  isDirty: () => boolean;
  saveDraft: () => Promise<boolean>;
}

interface EntryEditorProps {
  ref?: React.Ref<EntryEditorHandle>;
  entry: JournalEntry;
  photo?: PhotoRecord;
  allTags: string[];
  mode: AppMode;
  saving: boolean;
  uploadingPhoto: boolean;
  pickingGooglePhoto: boolean;
  onSave: (updated: JournalEntry) => Promise<boolean>;
  onDelete: (entry: JournalEntry) => Promise<void>;
  onUploadPhoto: (uuid: string, file: File) => Promise<void>;
  onPickFromGooglePhotos: (uuid: string) => Promise<void>;
  onRemovePhoto: (photo: PhotoRecord) => Promise<void>;
  onBack?: () => void;
  onBlobLoaded: (uuid: string, blob: Blob) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function serializeLocationCompare(loc?: EntryLocation): string {
  if (!loc) return '';
  return [
    loc.placeName ?? '',
    loc.locality ?? '',
    loc.administrativeArea ?? '',
    loc.country ?? '',
    loc.latitude ?? '',
    loc.longitude ?? '',
  ].join('\0');
}

export function EntryEditor({
  ref,
  entry,
  photo,
  allTags,
  mode,
  saving,
  uploadingPhoto,
  pickingGooglePhoto,
  onSave,
  onDelete,
  onUploadPhoto,
  onPickFromGooglePhotos,
  onRemovePhoto,
  onBack,
  onBlobLoaded,
  onDirtyChange,
}: EntryEditorProps) {
  const [text, setText] = useState(entry.entryText);
  const [starred, setStarred] = useState(entry.starred);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [creationDate, setCreationDate] = useState(entry.creationDate);
  const [location, setLocation] = useState<EntryLocation | undefined>(entry.location);
  const [editingDate, setEditingDate] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [locPlaceInput, setLocPlaceInput] = useState(entry.location?.placeName ?? '');
  const [locCityInput, setLocCityInput] = useState(entry.location?.locality ?? '');
  const [locating, setLocating] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTextLenRef = useRef(entry.entryText.length);

  // Sync local draft whenever selected entry changes
  useEffect(() => {
    setText(entry.entryText);
    lastTextLenRef.current = entry.entryText.length;
    setStarred(entry.starred);
    setTags(entry.tags);
    setCreationDate(entry.creationDate);
    setLocation(entry.location);
    setLocPlaceInput(entry.location?.placeName ?? '');
    setLocCityInput(entry.location?.locality ?? '');
    setEditingDate(false);
    setEditingLocation(false);
    setConfirmDelete(false);
    setJustSaved(false);
    // Open empty new entries in Edit mode
    if (!entry.entryText.trim()) {
      setPreviewMode(false);
    }
  }, [entry.uuid, entry.modifiedTime]);

  // Resize textarea efficiently via rAF — avoids synchronous forced reflow on every keystroke
  useEffect(() => {
    if (previewMode) return;
    const ta = textareaRef.current;
    if (!ta) return;

    const frame = requestAnimationFrame(() => {
      const shrank = text.length < lastTextLenRef.current;
      lastTextLenRef.current = text.length;
      if (shrank || ta.style.height === '') {
        ta.style.height = 'auto';
      }
      const nextHeight = Math.max(300, ta.scrollHeight);
      if (ta.clientHeight < nextHeight || shrank) {
        ta.style.height = `${nextHeight}px`;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [text, entry.uuid, previewMode]);

  const isDirty =
    text !== entry.entryText ||
    starred !== entry.starred ||
    creationDate !== entry.creationDate ||
    tags.join('\0') !== entry.tags.join('\0') ||
    serializeLocationCompare(location) !== serializeLocationCompare(entry.location);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSave = async (): Promise<boolean> => {
    if (saving) return false;
    const ok = await onSave({
      ...entry,
      entryText: text,
      starred,
      tags,
      creationDate,
      location,
    });
    if (ok) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
    }
    return ok;
  };

  useImperativeHandle(ref, () => ({
    isDirty: () => isDirty,
    saveDraft: () => handleSave(),
  }));

  // Stable refs so the global keydown listener only attaches once
  const keyStateRef = useRef({ isDirty, lightboxUrl, handleSave });
  keyStateRef.current = { isDirty, lightboxUrl, handleSave };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { isDirty: dirty, lightboxUrl: lb, handleSave: save } = keyStateRef.current;
      if (e.key === 'Escape' && lb) {
        e.preventDefault();
        setLightboxUrl(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty) {
          void save();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setPreviewMode((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const applyMarkdownFormat = (prefix: string, suffix = '', placeholder = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = text.slice(start, end) || placeholder;
    const next = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + selected.length;
      ta.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const applyLocationInputs = () => {
    const place = locPlaceInput.trim();
    const city = locCityInput.trim();
    if (!place && !city && location?.latitude === undefined) {
      setLocation(undefined);
    } else {
      setLocation({
        ...location,
        placeName: place || undefined,
        locality: city || undefined,
      });
    }
    setEditingLocation(false);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let placeName = locPlaceInput.trim() || undefined;
        let locality = locCityInput.trim() || undefined;
        let administrativeArea: string | undefined;
        let country: string | undefined;

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
          );
          if (res.ok) {
            const data = (await res.json()) as {
              name?: string;
              address?: {
                city?: string;
                town?: string;
                village?: string;
                suburb?: string;
                state?: string;
                country?: string;
              };
            };
            const addr = data.address;
            locality = addr?.city || addr?.town || addr?.village || addr?.suburb || locality;
            administrativeArea = addr?.state;
            country = addr?.country;
            placeName = data.name || locality || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
          }
        } catch {
          if (!placeName) {
            placeName = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
          }
        }

        const nextLoc: EntryLocation = {
          placeName,
          locality,
          administrativeArea,
          country,
          latitude,
          longitude,
        };
        setLocation(nextLoc);
        setLocPlaceInput(placeName ?? '');
        setLocCityInput(locality ?? '');
        setLocating(false);
        setEditingLocation(false);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const addTag = (raw: string) => {
    const cleaned = raw.trim().replace(/^#/, '');
    if (!cleaned) return;
    if (!tags.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      setTags([...tags, cleaned]);
    }
    setNewTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await onUploadPhoto(entry.uuid, file);
  };

  const openLightbox = (resolvedUrl: string) => {
    setLightboxUrl(resolvedUrl);
  };

  const closeLightbox = () => {
    setLightboxUrl(null);
  };

  const deferredText = useDeferredValue(text);
  const wordCount = useMemo(() => countWords(deferredText), [deferredText]);
  const readingMinutes = Math.max(1, Math.round(wordCount / 220));

  const suggestedTags = allTags
    .filter(
      (t) =>
        !tags.includes(t) &&
        (!newTagInput.trim() || t.toLowerCase().includes(newTagInput.trim().toLowerCase()))
    )
    .slice(0, 6);

  const locationLabel = [
    location?.placeName,
    location?.locality && location.locality !== location.placeName ? location.locality : undefined,
    location?.administrativeArea,
    location?.country,
  ]
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');

  const weatherLabel = entry.weather
    ? [
        entry.weather.fahrenheit
          ? `${entry.weather.fahrenheit}°F`
          : entry.weather.celsius
            ? `${entry.weather.celsius}°C`
            : '',
        entry.weather.description,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950">
      {/* Top toolbar */}
      <header className="px-3 md:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to entries"
              className="md:hidden p-2 -ml-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {editingDate ? (
            <div className="flex items-center gap-1.5">
              <input
                type="datetime-local"
                value={isoToDatetimeLocal(creationDate)}
                onChange={(e) => {
                  if (e.target.value) {
                    setCreationDate(datetimeLocalToIso(e.target.value));
                  }
                }}
                className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                onClick={() => setEditingDate(false)}
                className="text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              title="Click to edit entry date & time"
              className="text-left group min-w-0 cursor-pointer"
            >
              <div className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:inline" />
                <span className="truncate">{formatFullDate(creationDate)}</span>
              </div>
              <div className="text-[11px] text-slate-400">{formatTime(creationDate)}</div>
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={() => setPreviewMode((p) => !p)}
            title={previewMode ? 'Switch to Edit mode (⌘E)' : 'Switch to Read preview (⌘E)'}
            className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              previewMode
                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {previewMode ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">{previewMode ? 'Edit' : 'Read'}</span>
          </button>

          <button
            onClick={() => setStarred((s) => !s)}
            title={starred ? 'Remove from Favorites' : 'Add to Favorites'}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              starred
                ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50'
                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Star className={`w-4 h-4 ${starred ? 'fill-current' : ''}`} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto || pickingGooglePhoto}
            title={photo ? 'Replace photo from device' : 'Attach photo from device'}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {uploadingPhoto ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => void onPickFromGooglePhotos(entry.uuid)}
            disabled={uploadingPhoto || pickingGooglePhoto}
            title="Pick from Google Photos"
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {pickingGooglePhoto ? (
              <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
            ) : (
              <Images className="w-4 h-4" />
            )}
            <span className="hidden xl:inline">
              {pickingGooglePhoto ? 'Picking…' : 'Google Photos'}
            </span>
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 px-2 py-1 rounded-lg">
              <button
                onClick={() => onDelete(entry)}
                className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 ml-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Move entry to trash"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={saving || !isDirty}
            className={`ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isDirty
                ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
                : justSaved
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default'
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving…</span>
              </>
            ) : justSaved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{isDirty ? 'Save' : 'Saved'}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main editor canvas */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Attached photo */}
          {photo && (
            <div className="flex justify-center">
              <div className="relative group inline-flex items-center justify-center max-w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <PhotoThumbnail
                  photo={photo}
                  fit="contain"
                  eager
                  onBlobLoaded={onBlobLoaded}
                  onClick={openLightbox}
                  className="block max-w-full max-h-[70vh] w-auto h-auto"
                />
                <button
                  onClick={() => onRemovePhoto(photo)}
                  title="Remove photo"
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-900/70 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-rose-600 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Metadata pills (Location, Weather, Sync status, .doentry file) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <button
                onClick={() => setEditingLocation((v) => !v)}
                title="Edit or set location"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-sky-950/50 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-sky-500" />
                {locationLabel || 'Add location'}
              </button>

              {weatherLabel && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900">
                  <CloudSun className="w-3.5 h-3.5 text-amber-500" />
                  {weatherLabel}
                </span>
              )}

              {entry.pendingSync && mode === 'drive' && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-medium"
                  title="Saved locally in your browser — will upload to Google Drive on next sync"
                >
                  <CloudOff className="w-3 h-3" />
                  Pending sync
                </span>
              )}

              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900 font-mono text-[11px] opacity-80"
                title={
                  mode === 'drive'
                    ? 'Edits save directly back to this .doentry file in Google Drive'
                    : 'Demo mode — edits save locally in your browser'
                }
              >
                <FileCode2 className="w-3 h-3" />
                {entry.fileName}
              </span>
            </div>

            {editingLocation && (
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  value={locPlaceInput}
                  onChange={(e) => setLocPlaceInput(e.target.value)}
                  placeholder="Place name (e.g. Central Park)"
                  className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:border-sky-400 focus:outline-none"
                />
                <input
                  type="text"
                  value={locCityInput}
                  onChange={(e) => setLocCityInput(e.target.value)}
                  placeholder="City"
                  className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:border-sky-400 focus:outline-none"
                />
                {typeof navigator !== 'undefined' && 'geolocation' in navigator && (
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locating}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25 font-medium cursor-pointer disabled:opacity-50"
                  >
                    {locating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LocateFixed className="w-3.5 h-3.5" />
                    )}
                    Use current
                  </button>
                )}
                <button
                  type="button"
                  onClick={applyLocationInputs}
                  className="px-2.5 py-1.5 rounded-lg bg-sky-500 text-white font-semibold hover:bg-sky-600 cursor-pointer"
                >
                  Apply
                </button>
                {location && (
                  <button
                    type="button"
                    onClick={() => {
                      setLocation(undefined);
                      setLocPlaceInput('');
                      setLocCityInput('');
                      setEditingLocation(false);
                    }}
                    className="px-2 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Subtle Markdown formatting bar in Edit mode */}
          {!previewMode && (
            <div className="flex items-center gap-1 pb-2 border-b border-slate-100 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => applyMarkdownFormat('## ', '', 'Heading')}
                title="Heading"
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyMarkdownFormat('**', '**', 'bold')}
                title="Bold"
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyMarkdownFormat('*', '*', 'italic')}
                title="Italic"
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyMarkdownFormat('- ', '', 'List item')}
                title="Bullet list"
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyMarkdownFormat('> ', '', 'Quote')}
                title="Blockquote"
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <span className="ml-auto text-[11px] text-slate-400">
                Markdown supported
              </span>
            </div>
          )}

          {/* Writing area or Markdown Reader */}
          {previewMode ? (
            <div className="min-h-[300px] py-1">
              <MarkdownPreview content={text} />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your journal entry…"
              className="w-full resize-none bg-transparent text-base sm:text-[17px] leading-relaxed text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
          )}

          {/* Tags editor + Word count footer */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400 mr-1" />
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/70"
                >
                  #{tag}
                  <button
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    className="hover:text-rose-500 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(newTagInput);
                  }
                }}
                placeholder="Add tag…"
                className="text-xs px-2 py-1 rounded-md bg-transparent border border-transparent focus:border-slate-300 dark:focus:border-slate-700 focus:outline-none min-w-[90px]"
              />
            </div>

            {newTagInput.trim() && suggestedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => addTag(suggestion)}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-sky-900 cursor-pointer"
                  >
                    + #{suggestion}
                  </button>
                ))}
              </div>
            )}

            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
                {wordCount > 0 ? ` · ${readingMinutes} min read` : ''}
              </span>
              <span className="hidden sm:inline">⌘S Save · ⌘E {previewMode ? 'Edit' : 'Read'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            aria-label="Close photo"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full-size journal photo"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-default"
          />
        </div>
      )}
    </div>
  );
}
