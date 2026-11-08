// Läuft im Seitenkontext von music.youtube.com (Zugriff auf ytcfg + Sitzung + Player)
(() => {
  if (window.__ytmMixBridge) return; window.__ytmMixBridge = true;
  const ORIGIN = 'https://music.youtube.com';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const cookie = (n) => { const m = document.cookie.match(new RegExp('(?:^|; )' + n.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; };
  async function sha1(s) { const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  async function authHeader() {
    const ts = Math.floor(Date.now() / 1000), parts = [];
    const sap = cookie('SAPISID') || cookie('__Secure-3PAPISID');
    if (!sap) throw new Error('Nicht angemeldet (kein SAPISID-Cookie).');
    parts.push(`SAPISIDHASH ${ts}_${await sha1(`${ts} ${sap} ${ORIGIN}`)}`);
    const p1 = cookie('__Secure-1PAPISID'); if (p1) parts.push(`SAPISID1PHASH ${ts}_${await sha1(`${ts} ${p1} ${ORIGIN}`)}`);
    const p3 = cookie('__Secure-3PAPISID'); if (p3) parts.push(`SAPISID3PHASH ${ts}_${await sha1(`${ts} ${p3} ${ORIGIN}`)}`);
    return parts.join(' ');
  }
  const cfg = (k) => (window.ytcfg && window.ytcfg.get) ? window.ytcfg.get(k) : undefined;
  async function call(endpoint, body) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': await authHeader(),
      'X-Origin': ORIGIN,
      'X-Goog-AuthUser': String(cfg('SESSION_INDEX') ?? 0),
      'X-Youtube-Client-Name': String(cfg('INNERTUBE_CONTEXT_CLIENT_NAME') ?? 67),
      'X-Youtube-Client-Version': String(cfg('INNERTUBE_CLIENT_VERSION') ?? ''),
    };
    const vd = cfg('VISITOR_DATA'); if (vd) headers['X-Goog-Visitor-Id'] = vd;
    const del = cfg('DELEGATED_SESSION_ID'); if (del) headers['X-Goog-PageId'] = del;
    const r = await fetch(`${ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST', credentials: 'include', headers, body: JSON.stringify({ context: cfg('INNERTUBE_CONTEXT'), ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    return j;
  }
  async function createPlaylist({ title, description, videoIds, privacy }) {
    const first = videoIds.slice(0, 100);
    const res = await call('playlist/create', { title, description, privacyStatus: privacy || 'PRIVATE', videoIds: first });
    const playlistId = res.playlistId;
    if (!playlistId) throw new Error('Keine Playlist-ID erhalten.');
    for (let i = 100; i < videoIds.length; i += 100) {
      const actions = videoIds.slice(i, i + 100).map(v => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: v, dedupeOption: 'DEDUPE_OPTION_SKIP' }));
      await call('browse/edit_playlist', { playlistId, actions });
    }
    return { playlistId, url: `${ORIGIN}/playlist?list=${playlistId}` };
  }

  function queryDeep(selector, root = document) {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const node of nodes) {
      if (node.shadowRoot) {
        const found = queryDeep(selector, node.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  function htmlVideo() {
    return queryDeep('video') || document.querySelector('video');
  }

  function pageVideoId() {
    const v = new URLSearchParams(location.search).get('v');
    if (v) return v;
    try {
      const mp = document.getElementById('movie_player');
      if (mp?.getVideoData) {
        const id = mp.getVideoData().video_id;
        if (id) return id;
      }
    } catch (e) { /* */ }
    return null;
  }

  function isPlayerPaused() {
    const mp = document.getElementById('movie_player');
    if (mp?.classList.contains('paused-mode')) return true;
    const v = htmlVideo();
    return !v || v.paused;
  }

  function isVideoPlaying(video, videoId) {
    if (isPlayerPaused()) return false;
    const v = video || htmlVideo();
    if (!v) return false;
    const cur = pageVideoId();
    if (videoId && cur && cur !== videoId) return false;
    return !v.paused && (v.currentTime > 0.02 || v.readyState >= 3);
  }

  async function nudgePlay() {
    const video = htmlVideo();
    if (video?.paused) {
      try { await video.play(); } catch (e) { /* Autoplay-Richtlinie */ }
    }
    const barBtn = document.querySelector('ytmusic-player-bar #play-pause-button button');
    const label = (barBtn?.getAttribute('aria-label') || '').toLowerCase();
    if (barBtn && /wiedergeben|play|abschicken/.test(label)) barBtn.click();
    else {
      const btn = queryDeep('ytmusic-player-bar #play-pause-button button') || queryDeep('#play-pause-button button');
      btn?.click();
    }
    await sleep(400);
  }

  async function waitForVideoPlayback(videoId, timeoutMs = 40000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const video = htmlVideo();
      if (video) {
        if (!isVideoPlaying(video, videoId)) await nudgePlay();
        if (isVideoPlaying(video, videoId)) {
          return { ok: true, leadInMs: 1800 };
        }
      }
      if (navigator.mediaSession?.playbackState === 'playing' && !isPlayerPaused()) {
        const cur = pageVideoId();
        if (!videoId || !cur || cur === videoId) return { ok: true, leadInMs: 1500 };
      }
      await sleep(280);
    }
    const v = htmlVideo();
    const hint = !v ? 'Kein Video-Element' : (v.paused ? 'Player pausiert (einmal Play im YT-Tab)' : 'falsche Video-ID');
    return { ok: false, error: `Wiedergabe startet nicht (${hint}).` };
  }

  function clickPlaylistRow(videoId) {
    const rows = [...document.querySelectorAll('ytmusic-playlist-shelf-renderer ytmusic-responsive-list-item-renderer')];
    const row = rows.find((r) => r.querySelector(`.title-column a[href*="v=${videoId}"], a[href*="v=${videoId}"]`));
    if (!row) return false;
    row.scrollIntoView({ block: 'center' });
    const play = row.querySelector('ytmusic-play-button-renderer#play-button');
    if (play) {
      play.click();
      return true;
    }
    row.querySelector('.title-column a[href*="watch?v="]')?.click();
    return true;
  }

  function emitProgress(trackId, videoId, pct, label, live = '') {
    window.postMessage({
      src: 'ytmmix-bridge',
      kind: 'progress',
      trackId,
      videoId,
      pct: Math.round(pct),
      label,
      live,
    }, ORIGIN);
  }

  function bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  }

  async function waitCaptureDuration(durationSec, onTick) {
    const video0 = htmlVideo();
    const t0Media = video0?.currentTime ?? 0;
    const t0Wall = Date.now();
    while (true) {
      const v = htmlVideo();
      let elapsed;
      if (v && !v.paused && v.currentTime >= t0Media) {
        elapsed = v.currentTime - t0Media;
      } else {
        elapsed = (Date.now() - t0Wall) / 1000;
      }
      const frac = Math.min(1, elapsed / durationSec);
      const bg = document.hidden ? ' · Tab im Hintergrund!' : '';
      const live = v
        ? `▶ ${v.currentTime.toFixed(1)} s · Aufnahme ${Math.min(durationSec, Math.ceil(elapsed))}/${durationSec} s${bg}`
        : `Aufnahme ${Math.min(durationSec, Math.ceil(elapsed))}/${durationSec} s${bg}`;
      onTick?.(frac, live);
      if (elapsed >= durationSec) break;
      await sleep(200);
    }
  }

  async function captureFromVideoElement(durationSec, onTick) {
    const video = htmlVideo();
    if (!video) throw new Error('Kein Video-Element');
    const cap = video.captureStream || video.mozCaptureStream;
    if (!cap) throw new Error('captureStream im Player nicht verfügbar');
    const full = cap.call(video);
    const tracks = full.getAudioTracks();
    if (!tracks.length) throw new Error('Keine Audiospur im Player');
    const stream = new MediaStream(tracks);
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    recorder.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
    const blobPromise = new Promise((resolve, reject) => {
      recorder.onerror = () => reject(new Error('MediaRecorder-Fehler'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });
    recorder.start(500);
    try {
      await waitCaptureDuration(durationSec, onTick);
    } finally {
      if (recorder.state === 'recording') {
        try { recorder.requestData(); } catch (e) { /* optional */ }
        recorder.stop();
      }
    }
    const stopGuard = sleep(20000).then(() => {
      throw new Error('MediaRecorder liefert keine Daten (Stop hängt)');
    });
    const out = await Promise.race([blobPromise, stopGuard]);
    tracks.forEach((t) => t.stop());
    if (!out.size) throw new Error('Keine Audiodaten (Wiedergabe aktiv?)');
    return out;
  }

  function pausePlayback() {
    const barBtn = document.querySelector('ytmusic-player-bar #play-pause-button button');
    const label = (barBtn?.getAttribute('aria-label') || '').toLowerCase();
    if (barBtn && /pausieren|pause/.test(label)) barBtn.click();
    else htmlVideo()?.pause();
  }

  async function recordTrack(videoId, playlistId, durationSec = 32, trackId = null) {
    const step = (pct, label, live = '') => emitProgress(trackId, videoId, pct, label, live);
    step(4, 'Wiedergabe vorbereiten');
    const prep = await ensurePlayback(videoId, playlistId);
    if (prep.reloading) {
      step(8, 'Seite lädt …', 'YouTube Music');
      return { ok: true, reloading: true };
    }
    if (!prep.ok) return prep;
    step(14, 'Player anstoßen');
    await sleep(Math.min(prep.leadInMs ?? 800, 1000));
    if (!isVideoPlaying(htmlVideo(), videoId)) {
      step(16, 'Warte auf Wiedergabe');
      const playing = await waitForVideoPlayback(videoId, 15000);
      if (!playing.ok) return playing;
    }
    step(22, 'Nimmt Audio auf');
    const blob = await captureFromVideoElement(durationSec, (frac, live) => {
      step(22 + frac * 58, 'Nimmt Audio auf', live);
    });
    pausePlayback();
    step(86, 'Audio kodieren');
    const buf = await blob.arrayBuffer();
    step(92, 'Übertrage Daten', `${Math.round(buf.byteLength / 1024)} KB`);
    return { ok: true, audioB64: bufferToBase64(buf), mime: blob.type || 'audio/webm' };
  }

  async function ensurePlayback(videoId, playlistId) {
    const list = playlistId || new URLSearchParams(location.search).get('list');
    const cur = pageVideoId();

    if (cur === videoId && !isPlayerPaused()) {
      return { ok: true, leadInMs: 1200 };
    }

    if (clickPlaylistRow(videoId)) {
      await sleep(900);
      await nudgePlay();
      const quick = await waitForVideoPlayback(videoId, 25000);
      if (quick.ok) return quick;
    }

    const url = `${ORIGIN}/watch?v=${videoId}` + (list ? `&list=${list}` : '');
    const ret = { ok: true, reloading: true };
    setTimeout(() => { location.assign(url); }, 50);
    return ret;
  }

  window.addEventListener('message', async (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.src !== 'ytmmix-cs') return;
    const reply = (o) => window.postMessage({ src: 'ytmmix-bridge', id: d.id, ...o }, ORIGIN);
    try {
      if (d.cmd === 'createPlaylist') reply({ ok: true, result: await createPlaylist(d.payload) });
      else if (d.cmd === 'ensurePlayback') reply(await ensurePlayback(d.videoId, d.playlistId));
      else if (d.cmd === 'waitForVideo') reply(await waitForVideoPlayback(d.videoId, d.timeoutMs || 40000));
      else if (d.cmd === 'recordTrack') reply(await recordTrack(d.videoId, d.playlistId, d.durationSec || 32, d.trackId ?? null));
      else if (d.cmd === 'playVideo') {
        const { videoId, playlistId } = d;
        const list = playlistId || new URLSearchParams(location.search).get('list');
        const url = `${ORIGIN}/watch?v=${videoId}` + (list ? `&list=${list}` : '');
        const cur = new URLSearchParams(location.search).get('v');
        if (/\/watch/.test(location.pathname) && cur === videoId) reply({ ok: true, reloading: false });
        else {
          location.assign(url);
          reply({ ok: true, reloading: true });
        }
      } else reply({ ok: false, error: 'Unbekannter Befehl' });
    } catch (e) { reply({ ok: false, error: String(e.message || e) }); }
  });
})();
