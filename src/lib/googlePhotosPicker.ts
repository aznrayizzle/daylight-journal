import { driveService } from './googleDrive';

const PICKER_API = 'https://photospicker.googleapis.com/v1';

interface PickerSession {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: {
    pollInterval?: string;
    timeoutIn?: string;
  };
}

interface PickedMediaItem {
  id: string;
  createTime?: string;
  type?: string;
  mediaFile?: {
    baseUrl: string;
    mimeType: string;
    filename?: string;
  };
}

function parseDurationMs(duration?: string, fallbackMs = 3000): number {
  if (!duration) return fallbackMs;
  const match = duration.match(/^([\d.]+)s$/);
  if (!match) return fallbackMs;
  const ms = Math.round(parseFloat(match[1]) * 1000);
  return Number.isFinite(ms) && ms >= 1000 ? ms : fallbackMs;
}

/**
 * Opens the official Google Photos Picker in a new window, waits for the user to select
 * a single photo, downloads it using the OAuth bearer token, and returns it as a File.
 */
export async function pickPhotoFromGooglePhotos(
  clientId: string,
  signal?: AbortSignal
): Promise<File | null> {
  if (!clientId.trim()) {
    throw new Error('Please enter your Google Cloud OAuth Client ID in Settings first.');
  }

  let token = driveService.getToken();
  if (!token) {
    token = await driveService.signIn(clientId);
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  // 1. Create a Picker session (max 1 item)
  const createRes = await fetch(`${PICKER_API}/sessions`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickingConfig: {
        maxItemCount: '1',
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '');
    if (createRes.status === 403) {
      throw new Error(
        'Google Photos Picker API is not enabled or authorized. Enable "Google Photos Picker API" in Google Cloud Console and reconnect.'
      );
    }
    throw new Error(`Could not start Google Photos Picker (${createRes.status}): ${errText}`);
  }

  const session = (await createRes.json()) as PickerSession;
  const pickerUrl = `${session.pickerUri}/autoclose`;

  // 2. Open Google Photos Picker in a popup window (Google forbids iframes for security)
  const popup = window.open(
    pickerUrl,
    'google-photos-picker',
    'width=980,height=720,noopener=false'
  );
  if (!popup) {
    throw new Error('Popup was blocked by your browser. Please allow popups for this site and try again.');
  }

  // 3. Poll session until user finishes selecting or cancels
  const pollIntervalMs = parseDurationMs(session.pollingConfig?.pollInterval, 2500);
  const maxWaitMs = 5 * 60 * 1000;
  const startedAt = Date.now();
  let mediaItemsSet = false;

  try {
    while (Date.now() - startedAt < maxWaitMs) {
      if (signal?.aborted) {
        try {
          popup.close();
        } catch {
          // ignore
        }
        return null;
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const statusRes = await fetch(`${PICKER_API}/sessions/${session.id}`, {
        headers: authHeaders,
      });
      if (!statusRes.ok) {
        throw new Error(`Failed checking Picker status (${statusRes.status}).`);
      }
      const status = (await statusRes.json()) as PickerSession;
      if (status.mediaItemsSet) {
        mediaItemsSet = true;
        break;
      }

      if (popup.closed) {
        // Give one final check in case the popup autoclosed right as selection finished
        const finalRes = await fetch(`${PICKER_API}/sessions/${session.id}`, {
          headers: authHeaders,
        });
        if (finalRes.ok) {
          const finalStatus = (await finalRes.json()) as PickerSession;
          if (finalStatus.mediaItemsSet) {
            mediaItemsSet = true;
          }
        }
        break;
      }
    }

    if (!mediaItemsSet) {
      return null;
    }

    // 4. List picked media item(s)
    const listRes = await fetch(
      `${PICKER_API}/mediaItems?sessionId=${encodeURIComponent(session.id)}&pageSize=1`,
      { headers: authHeaders }
    );
    if (!listRes.ok) {
      throw new Error(`Could not retrieve picked photo (${listRes.status}).`);
    }
    const listData = (await listRes.json()) as { mediaItems?: PickedMediaItem[] };
    const item = listData.mediaItems?.[0];
    if (!item?.mediaFile?.baseUrl) {
      return null;
    }

    // 5. Download high-res image bytes using the OAuth bearer token
    const downloadUrl = `${item.mediaFile.baseUrl}=w2048-h2048`;
    const imgRes = await fetch(downloadUrl, { headers: authHeaders });
    if (!imgRes.ok) {
      throw new Error(`Failed to download photo from Google Photos (${imgRes.status}).`);
    }
    const blob = await imgRes.blob();
    const mimeType = item.mediaFile.mimeType || blob.type || 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const fileName = item.mediaFile.filename || `google-photo.${ext}`;
    return new File([blob], fileName, { type: mimeType });
  } finally {
    // 6. Clean up Picker session
    void fetch(`${PICKER_API}/sessions/${session.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    }).catch(() => {});
  }
}
