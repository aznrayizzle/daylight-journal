import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CloudSun,
  FileCode2,
  ImagePlus,
  Loader2,
  MapPin,
  Save,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { AppMode, JournalEntry, PhotoRecord } from '../types';
import {
  datetimeLocalToIso,
  formatFullDate,
  formatTime,
  isoToDatetimeLocal,
} from '../lib/dateUtils';
import { PhotoThumbnail } from './PhotoThumbnail';

interface EntryEditorProps {
  entry: JournalEntry;
  photo?: PhotoRecord;
  allTags: string[];
  mode: AppMode;
  saving: boolean;
  uploadingPhoto: boolean;
  onSave: (updated: JournalEntry) => Promise<void>;
  onDelete: (entry: JournalEntry) => Promise<void>;
  onUploadPhoto: (uuid: string, file: File) => Promise<void>;
  onRemovePhoto: (photo: PhotoRecord) => Promise<void>;
  onBack?: () => void;
  onBlobLoaded: (uuid: string, blob: Blob) => void;
}

export function EntryEditor({
  entry,
  photo,
  allTags,
  mode,
  saving,
  uploadingPhoto,
  onSave,
  onDelete,
  onUploadPhoto,
  onRemovePhoto,
  onBack,
  onBlobLoaded,
}: EntryEditorProps) {
  const [text, setText] = useState(entry.entryText);
  const [starred, setStarred] = useState(entry.starred);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [creationDate, setCreationDate] = useState(entry.creationDate);
  const [editingDate, setEditingDate] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local draft whenever selected entry changes
  useEffect(() => {
    setText(entry.entryText);
    setStarred(entry.starred);
    setTags(entry.tags);
    setCreationDate(entry.creationDate);
    setEditingDate(false);
    setConfirmDelete(false);
    setJustSaved(false);
  }, [entry.uuid, entry.modifiedTime]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(320, ta.scrollHeight)}px`;
  }, [text, entry.uuid]);

  const isDirty =
    text !== entry.entryText ||
    starred !== entry.starred ||
    creationDate !== entry.creationDate ||
    tags.join('\0') !== entry.tags.join('\0');

  const handleSave = async () => {
    if (saving) return;
    await onSave({
      ...entry,
      entryText: text,
      starred,
      tags,
      creationDate,
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  // Cmd+S / Ctrl+S shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty) {
          void handleSave();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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

  const openLightbox = () => {
    if (!photo?.blob) return;
    const url = URL.createObjectURL(photo.blob);
    setLightboxUrl(url);
  };

  const closeLightbox = () => {
    if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
    setLightboxUrl(null);
  };

  const suggestedTags = allTags
    .filter(
      (t) =>
        !tags.includes(t) &&
        (!newTagInput.trim() || t.toLowerCase().includes(newTagInput.trim().toLowerCase()))
    )
    .slice(0, 6);

  const locationLabel = [
    entry.location?.placeName,
    entry.location?.locality,
    entry.location?.administrativeArea,
    entry.location?.country,
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
            disabled={uploadingPhoto}
            title={photo ? 'Replace photo' : 'Attach photo'}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {uploadingPhoto ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
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
            onClick={handleSave}
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
            <div className="relative group rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <PhotoThumbnail
                photo={photo}
                onBlobLoaded={onBlobLoaded}
                onClick={openLightbox}
                className="w-full max-h-[380px] object-cover"
              />
              <button
                onClick={() => onRemovePhoto(photo)}
                title="Remove photo"
                className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-900/70 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-rose-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Metadata pills (Location, Weather, .doentry file) */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {locationLabel && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900">
                <MapPin className="w-3.5 h-3.5 text-sky-500" />
                {locationLabel}
              </span>
            )}
            {weatherLabel && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900">
                <CloudSun className="w-3.5 h-3.5 text-amber-500" />
                {weatherLabel}
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

          {/* Writing area */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your journal entry…"
            className="w-full resize-none bg-transparent text-base sm:text-[17px] leading-relaxed text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />

          {/* Tags editor */}
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
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={closeLightbox}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={lightboxUrl}
            alt="Full-size journal photo"
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
