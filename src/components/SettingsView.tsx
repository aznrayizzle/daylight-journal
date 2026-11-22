import { useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Copy,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  Loader2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { AppSettings, SyncProgress } from '../types';
import { DEFAULT_FOLDER_ID } from '../lib/db';
import { extractFolderId } from '../lib/googleDrive';

interface SettingsViewProps {
  settings: AppSettings;
  isDriveSignedIn: boolean;
  syncProgress: SyncProgress;
  entryCount: number;
  photoCount: number;
  onSaveSettings: (next: AppSettings) => Promise<void>;
  onConnectAndSync: (clientId: string, folderId: string) => Promise<void>;
  onSignOutDrive: () => void;
  onSwitchToDemo: () => Promise<void>;
  onImportLocalDoentries: (files: FileList) => Promise<void>;
}

export function SettingsView({
  settings,
  isDriveSignedIn,
  syncProgress,
  entryCount,
  photoCount,
  onSaveSettings,
  onConnectAndSync,
  onSignOutDrive,
  onSwitchToDemo,
  onImportLocalDoentries,
}: SettingsViewProps) {
  const [clientId, setClientId] = useState(settings.clientId);
  const [folderInput, setFolderInput] = useState(settings.rootFolderId || DEFAULT_FOLDER_ID);
  const [showGuide, setShowGuide] = useState(!settings.clientId);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const localImportRef = useRef<HTMLInputElement>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const isSyncing =
    syncProgress.phase !== 'idle' &&
    syncProgress.phase !== 'done' &&
    syncProgress.phase !== 'error';

  const copyOrigin = async () => {
    try {
      await navigator.clipboard.writeText(origin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleConnect = async () => {
    setStatusMsg(null);
    const cleanedFolderId = extractFolderId(folderInput || DEFAULT_FOLDER_ID);
    const cleanedClientId = clientId.trim();
    if (!cleanedFolderId) {
      setStatusMsg('Please paste your Google Drive folder URL or ID first.');
      return;
    }
    if (!cleanedClientId) {
      setStatusMsg('Please paste your Google Cloud OAuth Client ID first (see setup guide below).');
      return;
    }
    await onSaveSettings({
      ...settings,
      clientId: cleanedClientId,
      rootFolderId: cleanedFolderId,
    });
    await onConnectAndSync(cleanedClientId, cleanedFolderId);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6 pb-20">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Settings & Google Drive Sync
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Connect directly to your Google Drive folder. Your journal stays 100% private — no
            third-party server ever sees your entries.
          </p>
        </div>

        {/* Status Summary Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                settings.mode === 'drive' && isDriveSignedIn
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
              }`}
            >
              {settings.mode === 'drive' && isDriveSignedIn ? (
                <Cloud className="w-5 h-5" />
              ) : (
                <CloudOff className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {settings.mode === 'demo'
                  ? 'Demo Mode (Local Sandbox)'
                  : isDriveSignedIn
                    ? 'Connected to Google Drive'
                    : 'Google Drive (Not Signed In)'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {entryCount} entries · {photoCount} photos cached
                {settings.layoutType && settings.mode === 'drive'
                  ? ` · Layout: ${settings.layoutType === 'standard' ? 'entries/ + photos/' : 'Flat folder'}`
                  : ''}
              </p>
            </div>
          </div>

          {settings.mode === 'drive' && isDriveSignedIn && (
            <button
              onClick={onSignOutDrive}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Sign Out
            </button>
          )}
        </div>

        {/* Google Drive Configuration */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-sky-500" />
            Google Drive Connection
          </h3>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Google Drive Folder URL or ID
            </label>
            <input
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="Paste folder URL or ID…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:border-sky-400 focus:outline-none font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Paste your Google Drive folder URL or ID. Auto-detects both standard{' '}
              <code>entries/ + photos/</code> and flat <code>.doentry</code> folders.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Google Cloud OAuth Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="1234567890-abcdefg.apps.googleusercontent.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:border-sky-400 focus:outline-none font-mono"
            />
          </div>

          {statusMsg && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{statusMsg}</p>
          )}

          {syncProgress.phase !== 'idle' && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {syncProgress.message}
                </span>
                {syncProgress.total > 0 && (
                  <span className="text-slate-400">
                    {Math.round((syncProgress.completed / syncProgress.total) * 100)}%
                  </span>
                )}
              </div>
              {syncProgress.total > 0 && (
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all duration-200"
                    style={{
                      width: `${Math.min(100, (syncProgress.completed / syncProgress.total) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleConnect}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isDriveSignedIn ? 'Sync Google Drive Now' : 'Connect & Sync Google Drive'}
            </button>

            {settings.mode !== 'demo' && (
              <button
                onClick={onSwitchToDemo}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Switch to Demo Mode
              </button>
            )}
          </div>
        </div>

        {/* One-time Free Google Cloud Setup Guide */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <button
            onClick={() => setShowGuide((s) => !s)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              One-Time Free Google Cloud Setup Guide (~5 min)
            </span>
            <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">
              {showGuide ? 'Hide' : 'Show'}
            </span>
          </button>

          {showGuide && (
            <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-3 border-t border-slate-100 dark:border-slate-800">
              <ol className="list-decimal list-inside space-y-2.5 leading-relaxed">
                <li>
                  Open{' '}
                  <a
                    href="https://console.cloud.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 dark:text-sky-400 underline inline-flex items-center gap-0.5"
                  >
                    Google Cloud Console <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  (free, no billing required) and create a new project (e.g., <strong>My Journal</strong>).
                </li>
                <li>
                  Go to <strong>APIs &amp; Services → Library</strong>, search for and{' '}
                  <strong>Enable</strong> both <strong>Google Drive API</strong> and{' '}
                  <strong>Google Photos Picker API</strong>.
                </li>
                <li>
                  Go to <strong>Google Auth Platform → Audience</strong> (or{' '}
                  <em>OAuth consent screen</em>), choose <strong>External</strong>, keep it in{' '}
                  <strong>Testing</strong> mode, and add your own Gmail address under{' '}
                  <strong>Test users</strong>.
                </li>
                <li>
                  Go to <strong>Clients → Create Client → Web application</strong>. Under{' '}
                  <strong>Authorized JavaScript origins</strong>, add this exact URL:
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono flex-1 truncate">
                      {origin}
                    </code>
                    <button
                      onClick={copyOrigin}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium cursor-pointer shrink-0"
                    >
                      {copiedOrigin ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    When you deploy for free (e.g. GitHub Pages or Cloudflare Pages), also add your
                    deployed <code>https://…</code> origin here.
                  </p>
                </li>
                <li>
                  Copy the generated <strong>Client ID</strong>, paste it above, and click{' '}
                  <strong>Connect &amp; Sync Google Drive</strong>!
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Local .doentry tester */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-500" />
            Test with Local .doentry Files
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Want to test how your real Day One / Journaley files render before setting up Google
            Drive OAuth? Select one or more local <code>.doentry</code> files to load them into
            your browser cache.
          </p>
          <input
            ref={localImportRef}
            type="file"
            multiple
            accept=".doentry,.xml"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void onImportLocalDoentries(e.target.files);
                e.target.value = '';
              }
            }}
            className="hidden"
          />
          <button
            onClick={() => localImportRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Local .doentry Files
          </button>
        </div>
      </div>
    </div>
  );
}
