import { SR, analyzeSignal, computeEnergy, fromCamelot, ALL_CAMELOT } from './analysis.js';
import { optimizeOrder, transitionCost, fitScore, tempoRatioInfo, averageTransitionFit } from './sorter.js';
import { norm, splitArtistTitle } from './sources.js';
import { captureYoutubeAudio, resolveSourceTabId, ytSourceMeta, CAPTURE_SEC } from './adapter/ytCapture.js';

const CACHE_V = 5;
const $ = (id) => document.getElementById(id);
const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const store = {
  async get(k) { if (hasChrome) return (await chrome.storage.local.get(k))[k]; const v = localStorage.getItem(k); return v ? JSON.parse(v) : undefined; },
  async set(k, v) { if (hasChrome) return chrome.storage.local.set({ [k]: v }); localStorage.setItem(k, JSON.stringify(v)); },
  async del(k) { if (hasChrome) return chrome.storage.local.remove(k); localStorage.removeItem(k); },
};

const state = { title: '', playlistId: null, sourceTabId: null, tracks: [], order: null, view: 'orig', running: false, stop: false, activeTrackId: null, analysisDone: 0, analysisTotal: 0 };

function trackTitleLine(t) {
  return (t.artist ? t.artist + ' - ' : '') + t.title;
}

function broadcastOverlay(partial) {
  if (!hasChrome || !chrome.runtime?.sendMessage) return;
  const sourceTabId = state.sourceTabId;
  if (sourceTabId == null) return;
  chrome.runtime.sendMessage({ type: 'analysisOverlay', sourceTabId, ...partial }).catch(() => {});
}

// ---------- Eingabe ----------
function setTracks(list) {
  state.tracks = list.map((t, i) => {
    const s = splitArtistTitle(t.artist, t.title);
    return { id: i, artist: String(s.artist || '').replace(/\s*-\s*Topic$/i, ''), title: s.title, album: t.album || '', videoId: t.videoId || null, duration: t.duration || '', status: 'neu' };
  });
  state.order = null; state.view = 'orig';
  $('trackInput').value = state.tracks.map(t => (t.artist ? t.artist + ' - ' : '') + t.title).join('\n');
  fillStartSel(); render();
}

function parseInput() {
  const lines = $('trackInput').value.split('\n').map(l => l.trim()).filter(Boolean);
  const old = new Map(state.tracks.map(t => [norm(t.artist + ' - ' + t.title), t]));
  return lines.map(l => {
    const prev = old.get(norm(l));
    if (prev) return prev;
    const s = splitArtistTitle('', l); return { artist: s.artist, title: s.title };
  });
}

// ---------- Analyse ----------
let audioCtx = null;
async function decodeToMono(buf) {
  audioCtx = audioCtx || new AudioContext();
  const decoded = await audioCtx.decodeAudioData(buf);
  const len = Math.ceil(decoded.duration * SR);
  const off = new OfflineAudioContext(1, len, SR);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

function cacheKey(t) {
  if (t.videoId) return 'v:' + t.videoId;
  return 'c:' + norm(t.artist) + '|' + norm(t.title);
}

function setTrackProg(t, pct, label, live = '') {
  t.prog = { pct: Math.max(0, Math.min(100, pct)), label, live };
  renderRow(t);
  if (state.running) {
    broadcastOverlay({
      running: true,
      done: state.analysisDone,
      total: state.analysisTotal,
      trackTitle: trackTitleLine(t),
      pct: t.prog.pct,
      label,
      live,
    });
  }
}

/** Fallback, wenn der YT-Tab gedrosselt wird und Bridge-Fortschritt nicht ankommt. */
function startCaptureProgressFallback(t, captureT0) {
  const PREP_EST_SEC = 12;
  return setInterval(() => {
    if (state.activeTrackId !== t.id) return;
    const elapsed = (Date.now() - captureT0) / 1000;
    const cur = t.prog?.pct ?? 0;
    if (cur >= 90) return;
    let est;
    let label = t.prog?.label || 'Läuft…';
    let live;
    if (elapsed < PREP_EST_SEC) {
      est = 2 + (elapsed / PREP_EST_SEC) * 20;
      live = t.prog?.live || 'YT Music kurz im Vordergrund lassen';
    } else {
      const capElapsed = elapsed - PREP_EST_SEC;
      est = 22 + Math.min(58, (capElapsed / CAPTURE_SEC) * 58);
      label = 'Nimmt Audio auf';
      const bridgeLive = t.prog?.live && /▶|Aufnahme \d+\//.test(t.prog.live);
      live = bridgeLive
        ? t.prog.live
        : `~${Math.ceil(Math.min(capElapsed, CAPTURE_SEC))}/${CAPTURE_SEC} s (Schätzung)`;
    }
    if (est > cur + 0.25) setTrackProg(t, Math.max(est, cur), label, live);
  }, 500);
}

function applyResult(t, res) {
  delete t.prog;
  t.src = res.src; t.a = res.a; t.status = 'ok';
  const m = res.manual || {};
  t.bpm = Math.round((m.bpm || t.a.bpm) * 10) / 10;
  t.bpmNote = m.bpm ? 'manuell' : 'YT-Analyse';
  const k = m.camelot ? (fromCamelot(m.camelot) || { key: t.a.key, camelot: t.a.camelot }) : { key: t.a.key, camelot: t.a.camelot };
  t.key = k.key; t.camelot = k.camelot; t.keyConf = m.camelot ? 1 : t.a.keyConf;
  t.meter = t.a.meter; t.groove = t.a.groove; t.manual = m;
  if (res.previewMime && res.previewData) {
    if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
    t.previewUrl = URL.createObjectURL(new Blob([res.previewData], { type: res.previewMime }));
  }
}

async function analyzeTrack(t, force, sourceTabId) {
  if (!t.videoId) { t.status = 'keine Video-ID'; return; }
  const key = cacheKey(t);
  if (!force) {
    const c = await store.get(key);
    if (c && c.v === CACHE_V) { applyResult(t, c); return; }
  }
  state.activeTrackId = t.id;
  t.status = 'läuft';
  setTrackProg(t, 2, 'Starte Aufnahme', 'YT Music Tab');
  const captureT0 = Date.now();
  const fallbackIv = startCaptureProgressFallback(t, captureT0);
  let buf;
  try {
    buf = await captureYoutubeAudio(sourceTabId, t.videoId, state.playlistId, CAPTURE_SEC, t.id);
  } finally {
    clearInterval(fallbackIv);
  }
  setTrackProg(t, 94, 'Dekodiere Audio');
  t.status = 'analysiere';
  await new Promise((r) => setTimeout(r, 0));
  const pcm = await decodeToMono(buf.slice(0));
  setTrackProg(t, 97, 'Signal auswerten');
  const a = analyzeSignal(pcm);
  setTrackProg(t, 99, 'Fast fertig', `BPM ${a.bpm} · ${a.camelot} · ${a.meter}`);
  const prev = await store.get(key);
  const src = ytSourceMeta(t.videoId);
  const res = {
    v: CACHE_V,
    src,
    a,
    manual: prev?.manual || {},
    previewMime: 'audio/webm',
    previewData: buf,
  };
  await store.set(key, { ...res, previewData: undefined, previewMime: undefined });
  applyResult(t, res);
  if (state.activeTrackId === t.id) state.activeTrackId = null;
}

async function runAnalysis() {
  if (state.running) return;
  state.running = true; state.stop = false;
  $('analyzeBtn').disabled = true; $('stopBtn').hidden = false; $('progress').hidden = false;
  const force = $('reanalyze').checked;
  const todo = state.tracks.filter(t => force || t.status !== 'ok');
  let done = 0;
  state.analysisTotal = todo.length;
  state.analysisDone = 0;
  const upd = () => {
    state.analysisDone = done;
    $('bar').style.width = (todo.length ? done / todo.length * 100 : 100) + '%';
    $('progText').textContent = `${done} / ${todo.length} analysiert`;
    broadcastOverlay({ running: true, done, total: todo.length });
  };
  upd();
  broadcastOverlay({ running: true, done: 0, total: todo.length, label: 'Analyse gestartet', pct: 0, live: '' });
  let sourceTabId;
  try {
    sourceTabId = await resolveSourceTabId(state.sourceTabId);
    state.sourceTabId = sourceTabId;
  } catch (e) {
    $('progText').textContent = e.message || String(e);
    state.running = false;
    $('analyzeBtn').disabled = false;
    $('stopBtn').hidden = true;
    render();
    return;
  }
  const queue = [...todo];
  while (queue.length && !state.stop) {
    const t = queue.shift();
    try { await analyzeTrack(t, force, sourceTabId); }
      catch (e) {
        delete t.prog;
        t.status = 'Fehler: ' + (e.message || e);
        console.warn(t, e);
      }
      if (state.activeTrackId === t.id) state.activeTrackId = null;
    done++;
    upd();
    renderRow(t);
  }
  computeEnergy(state.tracks.filter(t => t.status === 'ok'));
  state.running = false;
  $('analyzeBtn').disabled = false; $('stopBtn').hidden = true;
  const summary = state.stop
    ? `Abgebrochen – ${done} / ${todo.length}`
    : `Fertig – ${state.tracks.filter(t => t.status === 'ok').length} von ${state.tracks.length} Titeln analysiert`;
  $('progText').textContent = summary;
  broadcastOverlay({
    running: false,
    done,
    total: todo.length,
    summary,
    pct: 100,
    label: state.stop ? 'Abgebrochen' : 'Fertig',
    live: '',
  });
  render();
}

// ---------- Sortierung ----------
function weights() { return { key: +$('wKey').value, tempo: +$('wTempo').value, energy: +$('wEnergy').value, groove: +$('wGroove').value }; }

function sortOpts() {
  const ok = state.tracks.filter(t => t.status === 'ok');
  const startId = $('startSel').value;
  const fixedStart = startId === '' ? null : ok.findIndex(t => String(t.id) === startId);
  return {
    ok,
    rest: state.tracks.filter(t => t.status !== 'ok'),
    fixedStart: fixedStart >= 0 ? fixedStart : null,
  };
}

function applySortPerm(ok, rest, perm) {
  state.order = perm.map((i) => ok[i].id).concat(rest.map((t) => t.id));
  state.view = 'sorted';
}

function sortNow() {
  const { ok, rest, fixedStart } = sortOpts();
  const perm = optimizeOrder(ok, weights(), $('mode').value, { fixedStart, timeMs: 2500 });
  applySortPerm(ok, rest, perm);
  $('saveMsg').textContent = '';
  render();
}

async function sortAuto() {
  const { ok, rest, fixedStart } = sortOpts();
  if (ok.length < 2) return;
  const w = weights(), mode = $('mode').value;
  const idToIdx = new Map(ok.map((t, i) => [t.id, i]));
  let beforePerm = state.order
    ? state.order.map((id) => idToIdx.get(id)).filter((i) => i !== undefined)
    : [];
  if (beforePerm.length !== ok.length) {
    beforePerm = state.tracks.filter((t) => t.status === 'ok').map((t) => idToIdx.get(t.id)).filter((i) => i !== undefined);
  }
  if (beforePerm.length !== ok.length) beforePerm = ok.map((_, i) => i);
  const before = averageTransitionFit(ok, beforePerm, w, mode);
  const btn = $('autoSortBtn');
  const prevTxt = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Auto-Sort …';
  $('saveMsg').textContent = 'Verschiebe Titel bis keine bessere Passung mehr gefunden wird …';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const perm = optimizeOrder(ok, w, mode, { fixedStart, auto: true, timeMs: 45000 });
  applySortPerm(ok, rest, perm);
  const after = averageTransitionFit(ok, perm, w, mode);
  const gain = before != null && after != null ? after - before : null;
  $('saveMsg').textContent = gain != null && gain > 0
    ? `Auto-Sort: Ø Passung ${before} → ${after} (+${gain})`
    : `Auto-Sort: Ø Passung ${after ?? '–'} (keine weitere Verbesserung)`;
  btn.textContent = prevTxt;
  btn.disabled = false;
  render();
}

function currentList() {
  if (state.view === 'sorted' && state.order) { const by = new Map(state.tracks.map(t => [t.id, t])); return state.order.map(id => by.get(id)); }
  return state.tracks;
}

function avgFit(list) {
  const w = weights(), mode = $('mode').value; let s = 0, n = 0;
  for (let i = 0; i + 1 < list.length; i++) if (list[i].status === 'ok' && list[i + 1].status === 'ok') { s += fitScore(transitionCost(list[i], list[i + 1], w, mode).total); n++; }
  return n ? Math.round(s / n) : null;
}

// ---------- Darstellung ----------
const camColor = (c) => { const n = parseInt(c, 10); if (!n) return '#555'; return `hsl(${((n - 1) * 30 + 0) % 360} 70% ${c.endsWith('B') ? 62 : 50}%)`; };
const fitColor = (f) => f >= 80 ? 'var(--good)' : f >= 60 ? 'var(--mid)' : 'var(--bad)';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function statusCell(t) {
  if (t.status === 'ok' && t.src) {
    return `<a href="${esc(t.src.link)}" target="_blank" rel="noopener">${esc(t.src.source)}</a>`;
  }
  const p = t.prog;
  if (p || t.status === 'läuft' || t.status === 'analysiere' || String(t.status).startsWith('Fehler')) {
    const pct = p?.pct ?? (t.status === 'analysiere' ? 95 : 5);
    const label = p?.label || t.status;
    const live = p?.live ? `<div class="prog-live">${esc(p.live)}</div>` : '';
    return `<div class="tprog"><div class="tprog-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><div class="prog-row"><span class="prog-label">${esc(label)}</span><span class="prog-pct">${pct}%</span></div>${live}</div>`;
  }
  return esc(t.status);
}

function transitionText(a, b) {
  const { total, parts } = transitionCost(a, b, weights(), $('mode').value);
  const f = fitScore(total);
  const tr = tempoRatioInfo(a, b);
  const bits = [];
  bits.push(`Tonart ${fitScore(parts.key)}`);
  bits.push(`Tempo ${tr.pct.toFixed(1)}%${tr.mult !== 1 ? ' (½/2×)' : ''}`);
  const de = (b.energy ?? 5) - (a.energy ?? 5); bits.push(`Energie ${de >= 0 ? '+' : ''}${de.toFixed(1)}`);
  if ($('mode').value === 'mood' && parts.mood != null) bits.push(`Mood ${fitScore(parts.mood)}`);
  return `<span class="pill" style="background:${fitColor(f)}22;color:${fitColor(f)}">${f}</span><span class="sub">${bits.join(' · ')}</span>`;
}

function rowHtml(t, idx, next) {
  const ok = t.status === 'ok';
  const camOpts = ALL_CAMELOT.map(c => `<option ${c === t.camelot ? 'selected' : ''}>${c}</option>`).join('');
  const e = t.energy ?? null;
  const busy = !ok && t.status !== 'neu';
  return `<tr data-id="${t.id}" class="${t.status.startsWith('Fehler') || t.status === 'nicht gefunden' ? 'err' : (busy ? 'busy' : '')}">
    <td class="num">${idx + 1}</td>
    <td>${ok ? `<button class="play" data-play="${t.id}" title="Vorschau abspielen">▶</button>` : ''}</td>
    <td class="t">${esc(t.title)}<div class="a">${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}</div></td>
    <td class="num">${ok ? `<input type="number" step="0.1" min="40" max="250" value="${t.bpm}" data-bpm="${t.id}"><div class="conf" title="${esc(t.bpmNote)}">${esc(t.bpmNote)}</div>` : ''}</td>
    <td class="${ok && t.keyConf < 0.4 ? 'lowconf' : ''}">${ok ? esc(t.key) + `<div class="conf">Sicherheit ${Math.round(t.keyConf * 100)}%</div>` : ''}</td>
    <td>${ok ? `<select class="cam" style="color:${camColor(t.camelot)}" data-cam="${t.id}">${camOpts}</select>` : ''}</td>
    <td>${ok ? esc(t.meter) : ''}</td>
    <td class="num">${ok && e != null ? `<span class="ebar"><i style="width:${e * 10}%"></i></span>${e.toFixed(1)}` : ''}</td>
    <td class="num">${ok ? Math.round(t.groove * 100) + '%' : ''}</td>
    <td class="fit">${ok && next && next.status === 'ok' ? transitionText(t, next) : ''}</td>
    <td class="src status-col">${statusCell(t)}</td>
  </tr>`;
}

function render() {
  const list = currentList();
  document.querySelector('#tbl tbody').innerHTML = list.map((t, i) => rowHtml(t, i, list[i + 1])).join('');
  $('plTitle').textContent = state.title ? `${state.title} · ${state.tracks.length} Titel` : `${state.tracks.length} Titel`;
  const anyOk = state.tracks.some(t => t.status === 'ok');
  $('sortBtn').disabled = !anyOk || state.running;
  $('autoSortBtn').disabled = !anyOk || state.running || state.tracks.filter((t) => t.status === 'ok').length < 2;
  $('csvBtn').disabled = $('copyBtn').disabled = !state.tracks.length;
  $('saveBtn').disabled = !state.order || !state.tracks.some(t => t.videoId);
  const seg = $('viewSeg').children; seg[0].classList.toggle('on', state.view === 'orig'); seg[1].classList.toggle('on', state.view === 'sorted'); seg[1].disabled = !state.order;
  const fo = avgFit(state.tracks), fs = state.order ? avgFit(currentListFor('sorted')) : null;
  const okN = state.tracks.filter(t => t.status === 'ok').length;
  $('hstats').innerHTML = `<div>Analysiert<b>${okN}/${state.tracks.length}</b></div><div>Ø Passung original<b>${fo ?? '–'}</b></div><div>Ø Passung sortiert<b>${fs ?? '–'}</b></div>`;
}
function currentListFor(v) { const keep = state.view; state.view = v; const l = currentList(); state.view = keep; return l; }

function renderRow(t) {
  const tr = document.querySelector(`tr[data-id="${t.id}"]`); if (!tr) return;
  const list = currentList(); const i = list.indexOf(t);
  tr.outerHTML = rowHtml(t, i, list[i + 1]);
}

function fillStartSel() {
  $('startSel').innerHTML = '<option value="">Automatisch</option>' + state.tracks.map(t => `<option value="${t.id}">${esc((t.artist ? t.artist + ' - ' : '') + t.title)}</option>`).join('');
}

// ---------- Export ----------
function csv() {
  const list = currentList();
  const head = ['Pos', 'Interpret', 'Titel', 'BPM', 'Tonart', 'Camelot', 'Takt', 'Energie', 'Groove', 'Passung zum nächsten', 'Quelle', 'VideoId'];
  const rows = list.map((t, i) => {
    const n = list[i + 1];
    const fit = t.status === 'ok' && n && n.status === 'ok' ? fitScore(transitionCost(t, n, weights(), $('mode').value).total) : '';
    return [i + 1, t.artist, t.title, t.bpm ?? '', t.key ?? '', t.camelot ?? '', t.meter ?? '', t.energy ?? '', t.groove != null ? Math.round(t.groove * 100) : '', fit, t.src ? t.src.source : t.status, t.videoId ?? ''];
  });
  const s = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + s], { type: 'text/csv;charset=utf-8' }));
  a.download = `${(state.title || 'playlist').replace(/[^\w\-äöüÄÖÜß ]+/g, '_')}_${state.view === 'sorted' ? 'sortiert' : 'original'}.csv`;
  a.click();
}

async function savePlaylist() {
  const list = currentListFor('sorted');
  const videoIds = list.map(t => t.videoId).filter(Boolean);
  if (!videoIds.length) return;
  const title = `${state.title || 'Playlist'} (Mix-sortiert)`;
  if (!confirm(`Neue private Playlist „${title}“ mit ${videoIds.length} Titeln in deinem YT-Music-Konto anlegen? Die Original-Playlist bleibt unverändert.`)) return;
  $('saveBtn').disabled = true; $('saveMsg').textContent = 'Speichere …';
  const payload = { title, description: `Sortiert nach Übergangspassung (${$('mode').selectedOptions[0].text}) mit YT Music Mix-Analyse.`, videoIds, privacy: 'PRIVATE' };
  const r = await chrome.runtime.sendMessage({ type: 'savePlaylist', sourceTabId: state.sourceTabId, payload });
  $('saveBtn').disabled = false;
  if (r && r.ok) $('saveMsg').innerHTML = `Gespeichert: <a href="${r.result.url}" target="_blank" rel="noopener">${esc(title)}</a>`;
  else $('saveMsg').textContent = 'Fehler: ' + ((r && r.error) || 'unbekannt');
}

// ---------- Ereignisse ----------
$('toggleInput').onclick = () => { $('inputBox').hidden = !$('inputBox').hidden; };
$('applyInput').onclick = () => { setTracks(parseInput()); restoreFromCache(); };
$('analyzeBtn').onclick = () => { if (!$('inputBox').hidden && $('trackInput').value.trim()) { const p = parseInput(); if (p.length !== state.tracks.length || p.some((x, i) => x !== state.tracks[i])) setTracks(p); } runAnalysis(); };
$('stopBtn').onclick = () => { state.stop = true; };
$('sortBtn').onclick = sortNow;
$('autoSortBtn').onclick = () => { sortAuto(); };
$('csvBtn').onclick = csv;
$('copyBtn').onclick = async () => { await navigator.clipboard.writeText(currentList().map(t => (t.artist ? t.artist + ' - ' : '') + t.title).join('\n')); $('copyBtn').textContent = 'Kopiert'; setTimeout(() => $('copyBtn').textContent = 'Liste kopieren', 1500); };
$('saveBtn').onclick = savePlaylist;
$('viewSeg').onclick = (e) => { const v = e.target.dataset.v; if (v && !e.target.disabled) { state.view = v; render(); } };
for (const id of ['wKey', 'wTempo', 'wEnergy', 'wGroove']) { const upd = () => $(id + 'V').textContent = (+$(id).value).toFixed(1); $(id).oninput = () => { upd(); render(); }; upd(); }
$('mode').onchange = render;

if (hasChrome && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'trackProgress') return;
    const tid = msg.trackId;
    const t = tid != null
      ? state.tracks.find((x) => x.id === tid)
      : state.tracks.find((x) => x.videoId === msg.videoId && x.id === state.activeTrackId);
    if (!t || (state.activeTrackId != null && t.id !== state.activeTrackId)) return;
    setTrackProg(t, msg.pct, msg.label || '…', msg.live || '');
  });
}

const player = $('player'); let playing = null;
document.querySelector('#tbl tbody').addEventListener('click', (e) => {
  const id = e.target.dataset.play; if (id == null) return;
  const t = state.tracks.find(x => String(x.id) === id);
  document.querySelectorAll('.play').forEach(b => b.textContent = '▶');
  if (playing === t) { player.pause(); playing = null; return; }
  if (!t.previewUrl) {
    if (t.src?.link) window.open(t.src.link, '_blank', 'noopener');
    return;
  }
  player.src = t.previewUrl;
  player.play(); playing = t; e.target.textContent = '❚❚';
});
player.onended = () => { playing = null; document.querySelectorAll('.play').forEach(b => b.textContent = '▶'); };

document.querySelector('#tbl tbody').addEventListener('change', async (e) => {
  const bid = e.target.dataset.bpm, cid = e.target.dataset.cam; const id = bid ?? cid; if (id == null) return;
  const t = state.tracks.find(x => String(x.id) === id);
  const key = cacheKey(t); const c = await store.get(key); if (!c) return;
  c.manual = c.manual || {};
  if (bid != null) c.manual.bpm = +e.target.value || undefined;
  if (cid != null) c.manual.camelot = e.target.value;
  await store.set(key, c); applyResult(t, c); render();
});

async function restoreFromCache() {
  for (const t of state.tracks) { const c = await store.get(cacheKey(t)); if (c && c.v === CACHE_V) applyResult(t, c); }
  computeEnergy(state.tracks.filter(t => t.status === 'ok'));
  render();
}

// ---------- Start ----------
(async () => {
  const pending = await store.get('pending');
  if (pending && pending.tracks && pending.tracks.length) {
    state.title = pending.title || ''; state.playlistId = pending.playlistId; state.sourceTabId = pending.sourceTabId;
    await store.set('last', pending); await store.del('pending');
    setTracks(pending.tracks);
  } else {
    const last = await store.get('last');
    if (last && last.tracks) { state.title = last.title || ''; state.playlistId = last.playlistId; state.sourceTabId = last.sourceTabId; setTracks(last.tracks); }
    else { $('inputBox').hidden = false; render(); }
  }
  await restoreFromCache();
})();
