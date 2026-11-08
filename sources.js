// Titelabgleich und Vorschau-Quellen (Deezer: Vorschau + BPM, iTunes: Vorschau)

const NOISE = /\b(official|offizielles?|music|video|audio|lyrics?|lyric video|visuali[sz]er|hd|hq|4k|remaster(ed)?( \d{4})?|explicit|clean|mv|m\/v|from .* soundtrack)\b/i;
const KEEP = /\b(remix|mix|edit|version|live|acoustic|rework|bootleg|vip|dub|extended|instrumental)\b/i;

export function cleanTitle(t) {
  let s = String(t || '');
  s = s.replace(/[([{]([^)\]}]*)[)\]}]/g, (m, inner) => (KEEP.test(inner) && !NOISE.test(inner)) ? ` ${inner} ` : ' ');
  s = s.replace(/\s+[|•]\s+.*$/, '');
  s = s.replace(/\s(feat\.?|ft\.?|featuring)\s.*$/i, '');
  return s.replace(/\s+/g, ' ').trim();
}

export function cleanArtist(a) {
  return String(a || '').replace(/\s*-\s*Topic$/i, '').split(/\s*(,|&|\bx\b|\bfeat\.?|\bft\.?|•)\s*/i)[0].trim();
}

export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9äöüß ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s) { return new Set(norm(s).split(' ').filter(w => w.length > 1)); }
function jaccard(a, b) { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); }

export function matchScore(wantArtist, wantTitle, gotArtist, gotTitle) {
  const t = jaccard(cleanTitle(wantTitle), cleanTitle(gotTitle));
  const a = wantArtist ? jaccard(cleanArtist(wantArtist), gotArtist) : 0.5;
  return 0.65 * t + 0.35 * a;
}

// Wenn kein Interpret vorhanden ist, oft "Interpret - Titel" im Videotitel
export function splitArtistTitle(artist, title) {
  if (artist) return { artist, title };
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title || '');
  return m ? { artist: m[1], title: m[2] } : { artist: '', title };
}

let deezerBlocked = false;
let itunesChain = Promise.resolve();
const ITUNES_GAP = 2000; // seriell, ~30 Anfragen/Minute
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.status === 403) throw Object.assign(new Error('403'), { blocked: true });
    if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j && j.error && j.error.code === 4) { await sleep(2500 * (i + 1)); continue; } // Deezer-Quota
    return j;
  }
  throw new Error('Zu viele Anfragen');
}

async function deezerLookup(artist, title) {
  const qa = cleanArtist(artist), qt = cleanTitle(title);
  const urls = [];
  if (qa) urls.push(`https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${qa}" track:"${qt}"`)}&limit=8`);
  urls.push(`https://api.deezer.com/search?q=${encodeURIComponent(`${qa} ${qt}`.trim())}&limit=8`);
  for (const u of urls) {
    const j = await getJson(u);
    const list = (j && j.data) || [];
    let best = null, bs = 0;
    for (const d of list) {
      if (!d.preview) continue;
      const s = matchScore(artist, title, d.artist && d.artist.name, d.title);
      if (s > bs) { bs = s; best = d; }
    }
    if (best && bs >= 0.35) {
      let bpm = 0, gain = null;
      try { const t = await getJson(`https://api.deezer.com/track/${best.id}`); bpm = +t.bpm || 0; gain = t.gain ?? null; } catch (e) { /* optional */ }
      return { source: 'Deezer', match: bs, title: best.title, artist: best.artist && best.artist.name, preview: best.preview, link: best.link, refBpm: bpm, gain };
    }
  }
  return null;
}

async function itunesLookup(artist, title, country) {
  // Anfragen strikt nacheinander mit Mindestabstand
  const slot = itunesChain.then(() => sleep(ITUNES_GAP));
  itunesChain = slot;
  await slot;
  const term = `${cleanArtist(artist)} ${cleanTitle(title)}`.trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8&country=${country}`;
  let j;
  try { j = await getJson(url); }
  catch (e) { if (!e.blocked) throw e; await sleep(30000); j = await getJson(url); } // Apple-Ratenlimit: kurz pausieren
  let best = null, bs = 0;
  for (const d of (j.results || [])) {
    if (!d.previewUrl) continue;
    const s = matchScore(artist, title, d.artistName, d.trackName);
    if (s > bs) { bs = s; best = d; }
  }
  if (best && bs >= 0.35) return { source: 'iTunes', match: bs, title: best.trackName, artist: best.artistName, preview: best.previewUrl, link: best.trackViewUrl, refBpm: 0 };
  return null;
}

export async function findPreview(artist, title, { country = 'DE', prefer = 'deezer' } = {}) {
  const order = prefer === 'itunes' ? ['itunes', 'deezer'] : ['deezer', 'itunes'];
  let lastErr = null;
  for (const src of order) {
    try {
      if (src === 'deezer') { if (deezerBlocked) continue; const r = await deezerLookup(artist, title); if (r) return r; }
      else { const r = await itunesLookup(artist, title, country); if (r) return r; }
    } catch (e) {
      if (src === 'deezer' && (e.blocked || e instanceof TypeError)) deezerBlocked = true;
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}
