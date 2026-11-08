// Liest Playlist-Titel aus music.youtube.com, Wiedergabe für Analyse, Analyse-Knopf
(() => {
  if (window.__ytmMixCS) return; window.__ytmMixCS = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (el) => el ? (el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim() : '';

  function videoIdFromEl(root) {
    const a = root.querySelector('.title-column a[href*="watch?v="]')
      || root.querySelector('a[href*="watch?v="], a[href*="v="]');
    if (a) {
      try {
        const id = new URL(a.getAttribute('href'), location.href).searchParams.get('v');
        if (id) return id;
      } catch (e) { /* ignore */ }
    }
    const thumb = root.querySelector('[thumbnail], [style*="i.ytimg.com/vi/"]');
    const raw = thumb?.getAttribute('thumbnail') || thumb?.style?.backgroundImage || '';
    const m = String(raw).match(/\/vi\/([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function rowsNow() {
    let rows = [...document.querySelectorAll('ytmusic-playlist-shelf-renderer ytmusic-responsive-list-item-renderer')];
    if (!rows.length) {
      const shelf = document.querySelector('ytmusic-browse-response #contents ytmusic-shelf-renderer, ytmusic-section-list-renderer ytmusic-shelf-renderer');
      if (shelf) rows = [...shelf.querySelectorAll('ytmusic-responsive-list-item-renderer')];
    }
    return rows;
  }

  function parseRow(row, fallbackArtist) {
    const title = txt(row.querySelector('.title-column .title, .title'));
    const cols = row.querySelectorAll('.secondary-flex-columns yt-formatted-string');
    let artist = cols.length ? txt(cols[0]) : '';
    if (!artist) artist = fallbackArtist || '';
    const album = cols.length > 1 ? txt(cols[1]) : '';
    const dur = txt(row.querySelector('.fixed-columns yt-formatted-string, .fixed-column'));
    const videoId = videoIdFromEl(row);
    return { title, artist, album, duration: dur, videoId };
  }

  function queueTracks() {
    return [...document.querySelectorAll('ytmusic-player-queue-item')].map((q) => ({
      title: txt(q.querySelector('.song-title')),
      artist: txt(q.querySelector('.byline')).split('•')[0].trim(),
      album: '',
      duration: txt(q.querySelector('.duration')),
      videoId: videoIdFromEl(q),
    })).filter((t) => t.title);
  }

  async function waitForPlayerPlaying(videoId, timeoutMs = 40000) {
    try {
      return await bridgeCmd('waitForVideo', { videoId, timeoutMs });
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  async function bridgeCmd(cmd, data, timeoutMs) {
    const waitMs = timeoutMs ?? (cmd === 'recordTrack' ? 200000 : 90000);
    return new Promise((resolve, reject) => {
      const id = ++bridgeMsgSeq;
      bridgeWaiting.set(id, (d) => {
        if (d.ok === false) reject(new Error(d.error || 'Bridge-Fehler'));
        else resolve(d);
      });
      window.postMessage({ src: 'ytmmix-cs', id, cmd, ...data }, location.origin);
      setTimeout(() => {
        if (bridgeWaiting.delete(id)) {
          reject(new Error(`Bridge Zeitüberschreitung (${Math.round(waitMs / 1000)}s)`));
        }
      }, waitMs);
    });
  }

  let bridgeMsgSeq = 0;
  const bridgeWaiting = new Map();
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.src !== 'ytmmix-bridge') return;
    if (d.kind === 'progress') {
      updateAnalysisOverlay({
        running: true,
        pct: d.pct,
        label: d.label,
        live: d.live || '',
      });
      chrome.runtime.sendMessage({
        type: 'trackProgress',
        trackId: d.trackId,
        videoId: d.videoId,
        pct: d.pct,
        label: d.label,
        live: d.live || '',
      }).catch(() => {});
      return;
    }
    const cb = bridgeWaiting.get(d.id);
    if (cb) { bridgeWaiting.delete(d.id); cb(d); }
  });

  async function playVideoId(videoId, playlistId) {
    try {
      const r = await bridgeCmd('ensurePlayback', { videoId, playlistId });
      if (r.reloading) return { ok: true, reloading: true };
      return r;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  async function recordTrackAudio(videoId, playlistId, durationSec, trackId) {
    const sec = durationSec || 32;
    try {
      const waitMs = sec * 1000 + 120000;
      return await bridgeCmd('recordTrack', { videoId, playlistId, durationSec: sec, trackId }, waitMs);
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  async function loadAll(status) {
    let last = -1, stable = 0;
    for (let i = 0; i < 400 && stable < 4; i++) {
      const n = rowsNow().length;
      status(`Lade Titel … ${n}`);
      if (n === last) stable++; else { stable = 0; last = n; }
      const rows = rowsNow();
      if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'end' });
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(stable ? 700 : 450);
    }
    window.scrollTo(0, 0);
  }

  async function collect() {
    const btn = document.getElementById('ytmmix-btn');
    const status = (s) => { if (btn) btn.textContent = s; };
    try {
      if (rowsNow().length) await loadAll(status);
      const headerArtist = txt(document.querySelector('ytmusic-responsive-header-renderer .strapline-text a, ytmusic-detail-header-renderer .subtitle a'));
      let tracks = rowsNow().map((r) => parseRow(r, headerArtist)).filter((t) => t.title);
      if (!tracks.length) tracks = queueTracks();
      if (!tracks.length) {
        alert('Keine Titel gefunden. Bitte eine Playlist-Seite öffnen (music.youtube.com/playlist?list=…).');
        return;
      }
      const title = txt(document.querySelector('ytmusic-responsive-header-renderer h1, ytmusic-detail-header-renderer .title, ytmusic-editable-playlist-detail-header-renderer .title')) || document.title.replace(/ - YouTube Music$/, '');
      const playlistId = new URLSearchParams(location.search).get('list');
      chrome.runtime.sendMessage({ type: 'openApp', tracks, title, playlistId });
    } finally { status('♫ Mix-Analyse'); }
  }

  const overlayState = { running: false, done: 0, total: 0, trackTitle: '', pct: 0, label: '', live: '', summary: '' };

  function renderAnalysisOverlay() {
    const panel = document.getElementById('ytmmix-progress');
    if (!panel) return;
    const show = overlayState.running || (overlayState.summary && Date.now() - (overlayState.finishedAt || 0) < 120000);
    panel.hidden = !show;
    if (!show) return;
    const overall = panel.querySelector('[data-overall-bar]');
    const overallTxt = panel.querySelector('[data-overall-txt]');
    const trackBar = panel.querySelector('[data-track-bar]');
    const titleEl = panel.querySelector('[data-track-title]');
    const detail = panel.querySelector('[data-detail]');
    const total = overlayState.total || 0;
    const done = overlayState.done || 0;
    const overallPct = total ? Math.round((done / total) * 100) : (overlayState.running ? 0 : 100);
    if (overall) overall.style.width = overallPct + '%';
    if (overallTxt) {
      overallTxt.textContent = overlayState.running
        ? `${done} / ${total} Titel`
        : (overlayState.summary || `${done} / ${total}`);
    }
    if (titleEl) titleEl.textContent = overlayState.trackTitle || (overlayState.running ? '…' : '');
    const tp = Math.max(0, Math.min(100, Math.round(overlayState.pct || 0)));
    if (trackBar) trackBar.style.width = tp + '%';
    if (detail) {
      const bits = [];
      if (overlayState.label) bits.push(overlayState.label);
      bits.push(tp + '%');
      if (overlayState.live) bits.push(overlayState.live);
      detail.textContent = bits.join(' · ');
    }
  }

  function updateAnalysisOverlay(partial) {
    if (partial.running === false) overlayState.finishedAt = Date.now();
    Object.assign(overlayState, partial);
    renderAnalysisOverlay();
  }

  function ensureButton() {
    if (document.getElementById('ytmmix-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'ytmmix-wrap';
    Object.assign(wrap.style, {
      position: 'fixed', right: '20px', bottom: '96px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px',
      fontFamily: 'Roboto, Arial, sans-serif', color: '#fff', maxWidth: 'min(320px, calc(100vw - 40px))',
    });

    const panel = document.createElement('div');
    panel.id = 'ytmmix-progress';
    panel.hidden = true;
    Object.assign(panel.style, {
      width: '100%', padding: '10px 12px', borderRadius: '12px',
      border: '1px solid #ffffff33', background: '#1a1a1a', boxShadow: '0 2px 12px #000a',
      fontSize: '12px', lineHeight: '1.35',
    });
    panel.innerHTML = `
      <div style="margin-bottom:6px;color:#aaa;font-size:11px" data-overall-txt>0 / 0 Titel</div>
      <div style="height:4px;background:#333;border-radius:2px;overflow:hidden;margin-bottom:8px">
        <div data-overall-bar style="height:100%;width:0;background:#3ea6ff;transition:width .3s"></div>
      </div>
      <div data-track-title style="font-weight:500;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      <div style="height:6px;background:#333;border-radius:3px;overflow:hidden;margin-bottom:6px">
        <div data-track-bar style="height:100%;width:0;background:#1db954;transition:width .25s"></div>
      </div>
      <div data-detail style="color:#ccc;font-size:11px;word-break:break-word"></div>`;

    const b = document.createElement('button');
    b.id = 'ytmmix-btn'; b.textContent = '♫ Mix-Analyse'; b.title = 'Playlist analysieren und nach Übergangspassung sortieren';
    Object.assign(b.style, {
      padding: '10px 16px', borderRadius: '20px', border: '1px solid #ffffff33',
      background: '#212121', color: '#fff', font: '500 14px inherit', cursor: 'pointer', boxShadow: '0 2px 10px #0008',
    });
    b.addEventListener('click', collect);

    wrap.appendChild(panel);
    wrap.appendChild(b);
    document.body.appendChild(wrap);
  }
  ensureButton();
  new MutationObserver(ensureButton).observe(document.body, { childList: true });

  let seq = 0;
  const waiting = new Map();
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.src !== 'ytmmix-bridge') return;
    const cb = waiting.get(d.id);
    if (cb) { waiting.delete(d.id); cb(d); }
  });

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === 'analysisOverlay') {
      const { type: _t, sourceTabId: _id, ...rest } = msg;
      updateAnalysisOverlay(rest);
      return false;
    }
    if (msg.type === 'ping') { sendResponse({ ok: true }); return false; }
    if (msg.type === 'collect') { collect(); sendResponse({ ok: true }); return false; }
    if (msg.type === 'playVideoId') {
      playVideoId(msg.videoId, msg.playlistId).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
      return true;
    }
    if (msg.type === 'waitForPlayerPlaying') {
      waitForPlayerPlaying(msg.videoId).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
      return true;
    }
    if (msg.type === 'recordTrackAudio') {
      recordTrackAudio(msg.videoId, msg.playlistId, msg.durationSec, msg.trackId).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
      return true;
    }
    if (msg.type === 'createPlaylist') {
      const id = ++seq;
      waiting.set(id, (d) => sendResponse({ ok: d.ok, result: d.result, error: d.error }));
      window.postMessage({ src: 'ytmmix-cs', id, cmd: 'createPlaylist', payload: msg.payload }, location.origin);
      setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); sendResponse({ ok: false, error: 'Zeitüberschreitung' }); } }, 120000);
      return true;
    }
  });
})();
