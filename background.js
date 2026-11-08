// Vermittelt zwischen YT-Music-Tab und Analyse-Seite
const APP = chrome.runtime.getURL('app.html');

function waitTabComplete(tabId, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      if (ok) setTimeout(resolve, 1000);
      else reject(err);
    };
    const onUpdated = (id, info) => {
      if (id !== tabId) return;
      if (info.status === 'complete') finish(true);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish(true);
    }).catch((e) => finish(false, e));
    const timer = setTimeout(() => finish(false, new Error('YT-Music-Tab: Laden Zeitüberschreitung')), timeoutMs);
  });
}

async function tabsSend(tabId, payload) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, payload);
    if (r === undefined) {
      return {
        ok: false,
        error: 'Keine Antwort vom YT-Music-Tab (Seite neu laden oder Playlist erneut öffnen).',
      };
    }
    return r;
  } catch (e) {
    const m = String(e?.message || e);
    if (/receiving end does not exist|Could not establish connection/i.test(m)) {
      return {
        ok: false,
        error: 'Content-Script fehlt – music.youtube.com neu laden (F5), dann Analyse erneut starten.',
      };
    }
    return { ok: false, error: m };
  }
}

async function recordYtTrack(sourceTabId, videoId, playlistId, durationSec, trackId) {
  try {
    await chrome.tabs.get(sourceTabId);
  } catch (e) {
    return { ok: false, error: 'YT-Music-Tab wurde geschlossen.' };
  }

  try {
    await chrome.tabs.update(sourceTabId, { active: true });
  } catch (e) { /* optional */ }

  let r = await tabsSend(sourceTabId, {
    type: 'recordTrackAudio',
    videoId,
    playlistId,
    durationSec,
    trackId,
  });
  if (r.reloading) {
    await waitTabComplete(sourceTabId);
    r = await tabsSend(sourceTabId, {
      type: 'recordTrackAudio',
      videoId,
      playlistId,
      durationSec,
      trackId,
    });
  }
  return r;
}

function replyAsync(sendResponse, fn) {
  Promise.resolve()
    .then(fn)
    .then((r) => {
      try {
        sendResponse(r ?? { ok: false, error: 'Leere Antwort (Hintergrund)' });
      } catch (e) {
        console.warn('sendResponse', e);
      }
    })
    .catch((e) => {
      try {
        sendResponse({ ok: false, error: String(e?.message || e) });
      } catch (_) { /* Kanal geschlossen */ }
    });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && tab.url.startsWith('https://music.youtube.com/')) {
    try { await chrome.tabs.sendMessage(tab.id, { type: 'collect' }); return; } catch (e) { /* Seite neu laden nötig */ }
  }
  chrome.tabs.create({ url: APP });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ ok: true, v: '1.1.0' });
    return false;
  }

  if (msg.type === 'openApp') {
    const pending = { tracks: msg.tracks, title: msg.title, playlistId: msg.playlistId, sourceTabId: sender.tab && sender.tab.id, at: Date.now() };
    chrome.storage.local.set({ pending }).then(() => chrome.tabs.create({ url: APP }));
    return false;
  }

  if (msg.type === 'ytRecordTrack') {
    const { sourceTabId, videoId, playlistId, durationSec, trackId } = msg;
    replyAsync(sendResponse, () => recordYtTrack(sourceTabId, videoId, playlistId, durationSec || 32, trackId));
    return true;
  }

  if (msg.type === 'analysisOverlay') {
    const tabId = msg.sourceTabId;
    if (tabId != null && sender.tab?.id !== tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'analysisOverlay', ...msg }).catch(() => {});
    }
    return false;
  }

  if (msg.type === 'savePlaylist') {
    replyAsync(sendResponse, async () => {
      let tabId = msg.sourceTabId;
      try { if (tabId != null) await chrome.tabs.get(tabId); } catch (e) { tabId = null; }
      if (tabId == null) {
        const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
        if (!tabs.length) return { ok: false, error: 'Bitte zuerst music.youtube.com in einem Tab öffnen und anmelden.' };
        tabId = tabs[0].id;
      }
      return tabsSend(tabId, { type: 'createPlaylist', payload: msg.payload });
    });
    return true;
  }

  return false;
});
