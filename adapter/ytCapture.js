// Adapter: Wiedergabe + Audioaufnahme über video.captureStream() im YT-Music-Tab (kein tabCapture).

export const CAPTURE_SEC = 32;

function sendExtensionMessage(msg) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (response === undefined) {
          reject(new Error(
            'Keine Antwort vom Erweiterungs-Hintergrund. Unter comet://extensions die Erweiterung neu laden und music.youtube.com einmal neu laden.',
          ));
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function resolveSourceTabId(preferred) {
  if (preferred != null) {
    try {
      await chrome.tabs.get(preferred);
      return preferred;
    } catch (_) { /* Tab geschlossen */ }
  }
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  if (!tabs.length) {
    throw new Error('Bitte music.youtube.com in einem Tab öffnen (Playlist oder Wiedergabe).');
  }
  return tabs[0].id;
}

/**
 * Spielt videoId im YT-Tab ab und nimmt Audio vom Player-Video für durationSec Sekunden auf.
 * @returns {Promise<ArrayBuffer>}
 */
export async function captureYoutubeAudio(sourceTabId, videoId, playlistId, durationSec = CAPTURE_SEC, trackId = null) {
  await sendExtensionMessage({ type: 'ping' });

  const res = await sendExtensionMessage({
    type: 'ytRecordTrack',
    sourceTabId,
    videoId,
    playlistId: playlistId || null,
    durationSec,
    trackId,
  });
  if (!res.ok) {
    throw new Error(res.error || 'Aufnahme im YT-Music-Tab fehlgeschlagen');
  }
  if (!res.audioB64) {
    throw new Error('Keine Audiodaten vom Player erhalten');
  }
  return base64ToArrayBuffer(res.audioB64);
}

export function ytSourceMeta(videoId) {
  const link = `https://music.youtube.com/watch?v=${videoId}`;
  return { source: 'YouTube Music', link, match: 1, refBpm: 0, videoId };
}
