// Lokale Audioanalyse: Tempo, Takt, Tonart, Energie, Groove, Helligkeit.
// Reine Funktionen auf Float32Array (mono), damit Browser und Node-Tests denselben Code nutzen.

export const SR = 22050;

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Krumhansl-Kessler-Profile, leicht in Richtung Temperley geglättet
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// ---------- FFT (radix-2, in-place) ----------
function makeFFT(n) {
  const levels = Math.log2(n) | 0;
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  return function fft(re, im) {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim; re[j] += tre; im[j] += tim;
        }
      }
    }
  };
}

function hann(n) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); return w; }

// Liefert Betragsspektren frameweise über Callback
function stft(x, n, hop, cb) {
  const fft = makeFFT(n), w = hann(n);
  const re = new Float64Array(n), im = new Float64Array(n), mag = new Float64Array(n / 2);
  let f = 0;
  for (let start = 0; start + n <= x.length; start += hop, f++) {
    for (let i = 0; i < n; i++) { re[i] = x[start + i] * w[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    cb(mag, f);
  }
  return f;
}

// ---------- Tempo / Takt / Groove ----------
function onsetEnvelope(x) {
  const n = 1024, hop = 256, maxBin = Math.floor(8000 / (SR / n));
  let prev = null; const env = [];
  stft(x, n, hop, (mag) => {
    const cur = new Float64Array(maxBin);
    for (let k = 1; k < maxBin; k++) cur[k] = Math.log1p(100 * mag[k]);
    let flux = 0;
    if (prev) for (let k = 1; k < maxBin; k++) { const d = cur[k] - prev[k]; if (d > 0) flux += d; }
    env.push(flux); prev = cur;
  });
  // lokalen Mittelwert abziehen (Hochpass), halbwellengleichrichten
  const fps = SR / hop, win = Math.round(fps * 0.5), out = new Float64Array(env.length);
  let acc = 0; const q = [];
  for (let i = 0; i < env.length; i++) {
    q.push(env[i]); acc += env[i]; if (q.length > win) acc -= q.shift();
    out[i] = Math.max(0, env[i] - acc / q.length);
  }
  return { env: out, fps };
}

function autocorr(e, maxLag) {
  const n = e.length, ac = new Float64Array(maxLag + 1);
  let mean = 0; for (const v of e) mean += v; mean /= n;
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0; for (let i = 0; i + lag < n; i++) s += (e[i] - mean) * (e[i + lag] - mean);
    ac[lag] = s / (n - lag);
  }
  return ac;
}

function interp(ac, lag) { const i = Math.floor(lag), f = lag - i; if (i + 1 >= ac.length) return ac[ac.length - 1]; return ac[i] * (1 - f) + ac[i + 1] * f; }

function combScore(ac, lag) {
  // Puls auf Vielfachen der Schlagperiode
  let s = 0, wsum = 0;
  for (let k = 1; k <= 8; k++) { const l = lag * k; if (l >= ac.length - 1) break; const w = 1 / k ** 0.5; s += w * interp(ac, l); wsum += w; }
  return wsum ? s / wsum : 0;
}

export function analyzeTempo(x) {
  const { env, fps } = onsetEnvelope(x);
  const maxLag = Math.ceil(fps * 60 / 40 * 8) ;
  const ac = autocorr(env, Math.min(maxLag, env.length - 2));
  const ac0 = ac[0] || 1;
  let best = { bpm: 0, score: -Infinity };
  const scores = [];
  for (let bpm = 60; bpm <= 200; bpm += 0.1) {
    const lag = fps * 60 / bpm;
    const raw = combScore(ac, lag) / ac0;
    // Prior um ~120 BPM (log-Gauß), mildert Halb-/Doppeltempo-Fehler
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const s = raw * (0.6 + 0.4 * prior);
    scores.push([bpm, s, raw]);
    if (s > best.score) best = { bpm, score: s, raw };
  }
  // Konfidenz: Abstand zum besten Kandidaten, der nicht verwandt (x0.5/x2/x1.5) ist
  const related = (a, b) => [1, 2, 0.5, 1.5, 2 / 3, 3, 1 / 3].some(m => Math.abs(a * m - b) / b < 0.04);
  let second = 0;
  for (const [bpm, s] of scores) if (!related(bpm, best.bpm) && s > second) second = s;
  const conf = best.score > 0 ? Math.max(0, Math.min(1, (best.score - second) / best.score * 2.5)) : 0;

  // Oktavkorrektur: sehr langsame Schätzungen sind fast immer Halbtempo
  if (best.bpm < 78) { const dbl = best.bpm * 2; const raw2 = combScore(ac, fps * 60 / dbl) / ac0; if (raw2 > best.raw * 0.5) best = { bpm: dbl, score: best.score, raw: raw2 }; }
  const beatLag = fps * 60 / best.bpm;
  const a3 = interp(ac, beatLag * 3), a4 = interp(ac, beatLag * 4);
  const meter = a3 > a4 * 1.15 ? '3/4' : '4/4';
  const groove = Math.max(0, Math.min(1, (best.raw - 0.05) / 0.65)); // Pulsstärke 0..1

  // Onset-Dichte (Ereignisse pro Sekunde)
  let mean = 0; for (const v of env) mean += v; mean /= env.length;
  let peaks = 0; for (let i = 1; i < env.length - 1; i++) if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > mean * 1.5) peaks++;
  const density = peaks / (env.length / fps);

  return { bpm: Math.round(best.bpm * 10) / 10, bpmConf: conf, meter, groove, density };
}

// ---------- Tonart ----------
function defaultFreqWeight(f) {
  if (f < 70) return 0.45;
  if (f < 320) return 1.3;
  if (f < 1200) return 1;
  return 950 / f;
}

function normalizeChroma(chroma) {
  let s = 0;
  for (const v of chroma) s += v;
  if (s > 0) for (let i = 0; i < 12; i++) chroma[i] /= s;
  return chroma;
}

/** Chroma-Vektor aus einem PCM-Ausschnitt (Spektralspitzen + Tuning). */
export function buildChroma(x, opt = {}) {
  const n = opt.n || 8192, hop = n / 2, binHz = SR / n;
  const kMin = Math.ceil((opt.fmin || 55) / binHz), kMax = Math.floor((opt.fmax || 4500) / binHz);
  const peaksThresh = opt.peakRatio ?? 0.012;
  const peaks = [];
  stft(x, n, hop, (mag) => {
    let max = 0;
    for (let k = kMin; k <= kMax; k++) if (mag[k] > max) max = mag[k];
    if (max <= 0) return;
    const fr = [];
    for (let k = kMin + 1; k < kMax; k++) {
      const b = mag[k];
      if (b < max * peaksThresh || !(b > mag[k - 1] && b >= mag[k + 1])) continue;
      const a = Math.log(mag[k - 1] + 1e-12), bb = Math.log(b + 1e-12), c = Math.log(mag[k + 1] + 1e-12);
      const p = 0.5 * (a - c) / (a - 2 * bb + c || 1e-9);
      const f = (k + Math.max(-0.5, Math.min(0.5, p))) * binHz;
      fr.push([69 + 12 * Math.log2(f / 440), b / max, f]);
    }
    if (fr.length < 2) return;
    peaks.push(fr);
  });
  let cx = 0, cy = 0;
  for (const fr of peaks) for (const [m, w] of fr) { const d = m - Math.round(m); cx += w * Math.cos(2 * Math.PI * d); cy += w * Math.sin(2 * Math.PI * d); }
  const tuning = opt.noTune ? 0 : Math.atan2(cy, cx) / (2 * Math.PI);
  const chroma = new Float64Array(12);
  const wf = opt.wf || defaultFreqWeight;
  for (const fr of peaks) {
    const fc = new Float64Array(12);
    let frameW = 0;
    for (const [m0, w, f] of fr) {
      const spread = (opt.sqrt ? Math.sqrt(w) : w) * wf(f);
      frameW += spread;
      for (const ratio of [1, 2, 3]) {
        const ff = f / ratio;
        if (ff < 55) continue;
        const m = (69 + 12 * Math.log2(ff / 440)) - tuning;
        const r = Math.round(m), d = m - r;
        const wd = Math.exp(-0.5 * (d / 0.18) ** 2);
        const hW = ratio === 1 ? 1 : ratio === 2 ? 0.38 : 0.2;
        fc[((r % 12) + 12) % 12] += spread * wd * hW * (ratio > 1 ? wf(ff) : 1);
      }
    }
    let s = 0;
    for (const v of fc) s += v;
    if (s > 0 && frameW > 0.08) for (let i = 0; i < 12; i++) chroma[i] += (fc[i] / s) * frameW;
  }
  normalizeChroma(chroma);
  return { chroma, tuningCents: Math.round(tuning * 100) };
}

export function keyFromChroma(chroma, opt = {}) {
  const PMAJ = opt.maj || MAJOR, PMIN = opt.min || MINOR;
  const corr = (prof, shift) => {
    let mx = 0, mp = 0;
    for (let i = 0; i < 12; i++) { mx += chroma[i]; mp += prof[i]; }
    mx /= 12; mp /= 12;
    let num = 0, dx = 0, dp = 0;
    for (let i = 0; i < 12; i++) {
      const a = chroma[(i + shift) % 12] - mx, b = prof[i] - mp;
      num += a * b; dx += a * a; dp += b * b;
    }
    return num / Math.sqrt(dx * dp || 1e-12);
  };
  const cands = [];
  for (let t = 0; t < 12; t++) {
    cands.push({ pc: t, mode: 'major', r: corr(PMAJ, t) });
    cands.push({ pc: t, mode: 'minor', r: corr(PMIN, t) });
  }
  cands.sort((a, b) => b.r - a.r);
  const best = cands[0];
  const relOf = (c) => (c.mode === 'major' ? { pc: (c.pc + 9) % 12, mode: 'minor' } : { pc: (c.pc + 3) % 12, mode: 'major' });
  const rel = relOf(best);
  const second = cands.find((c) => c !== best && !(c.pc === rel.pc && c.mode === rel.mode));
  const margin = best.r - (second?.r ?? 0);
  const strength = Math.max(0, Math.min(1, (best.r - 0.32) / 0.42));
  const conf = Math.max(0, Math.min(1, margin * 7 * strength + strength * 0.22));
  return { ...keyInfo(best.pc, best.mode), keyConf: conf, keyPc: best.pc, keyMode: best.mode, corr: best.r, tuningCents: 0 };
}

export function analyzeKey(x, opt = {}) {
  if (x.length < SR * 6) {
    const { chroma, tuningCents } = buildChroma(x, opt);
    return { ...keyFromChroma(chroma, opt), tuningCents };
  }
  const skip = Math.round(SR * 2);
  const segLen = Math.round(SR * 7);
  const step = Math.round(SR * 5);
  const fused = new Float64Array(12);
  const votes = [];
  for (let start = skip; start + segLen <= x.length; start += step) {
    const { chroma, tuningCents } = buildChroma(x.subarray(start, start + segLen), opt);
    const k = keyFromChroma(chroma, opt);
    k.tuningCents = tuningCents;
    votes.push(k);
    for (let i = 0; i < 12; i++) fused[i] += chroma[i];
  }
  if (!votes.length) {
    const { chroma, tuningCents } = buildChroma(x, opt);
    return { ...keyFromChroma(chroma, opt), tuningCents };
  }
  normalizeChroma(fused);
  const out = keyFromChroma(fused, opt);
  const agree = votes.filter((k) => k.keyPc === out.keyPc && k.keyMode === out.keyMode).length / votes.length;
  const voteConf = votes.reduce((s, k) => s + k.keyConf, 0) / votes.length;
  out.keyConf = Math.max(0, Math.min(1, out.keyConf * (0.55 + 0.45 * agree) + agree * 0.12 + voteConf * 0.08));
  out.tuningCents = votes[Math.floor(votes.length / 2)].tuningCents;
  return out;
}

export function keyInfo(pc, mode) {
  const majPc = mode === 'major' ? pc : (pc + 3) % 12;
  const num = ((majPc * 7) % 12 + 7) % 12 + 1;
  return { keyPc: pc, keyMode: mode, key: NOTE_NAMES[pc] + (mode === 'minor' ? 'm' : ''), camelot: num + (mode === 'minor' ? 'A' : 'B') };
}

export function fromCamelot(code) {
  const m = /^(\d{1,2})([AB])$/i.exec(String(code).trim());
  if (!m) return null;
  const num = +m[1]; if (num < 1 || num > 12) return null;
  const minor = m[2].toUpperCase() === 'A';
  // num = ((majPc*7)%12 + 7)%12 + 1  ->  majPc*7 ≡ num-8 (mod 12), 7^-1 ≡ 7
  const majPc = (((num - 8) % 12 + 12) % 12) * 7 % 12;
  return minor ? keyInfo((majPc + 9) % 12, 'minor') : keyInfo(majPc, 'major');
}

export const ALL_CAMELOT = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();

// ---------- Klang / Energie ----------
export function analyzeTimbre(x) {
  let sum = 0, peak = 0;
  for (const v of x) { sum += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
  const rms = Math.sqrt(sum / x.length) || 1e-9;
  const loudDb = 20 * Math.log10(rms);
  const crestDb = 20 * Math.log10((peak || 1e-9) / rms);
  // Lautheitsverlauf in 400-ms-Blöcken -> Dynamik
  const blk = Math.round(SR * 0.4), lv = [];
  for (let i = 0; i + blk <= x.length; i += blk) { let s = 0; for (let j = i; j < i + blk; j++) s += x[j] * x[j]; lv.push(10 * Math.log10(s / blk + 1e-12)); }
  lv.sort((a, b) => a - b);
  const dyn = lv.length > 4 ? lv[Math.floor(lv.length * 0.95)] - lv[Math.floor(lv.length * 0.1)] : 0;
  // Spektraler Schwerpunkt + Tiefenanteil
  const n = 2048, binHz = SR / n; let cNum = 0, cDen = 0, low = 0, all = 0;
  stft(x, n, 1024, (mag) => {
    for (let k = 1; k < n / 2; k++) { const p = mag[k] * mag[k]; cNum += k * binHz * mag[k]; cDen += mag[k]; all += p; if (k * binHz < 150) low += p; }
  });
  return { loudDb, crestDb, dynamics: dyn, centroid: cDen ? cNum / cDen : 0, bassRatio: all ? low / all : 0 };
}

export function analyzeSignal(x) {
  const t = analyzeTempo(x), k = analyzeKey(x), m = analyzeTimbre(x);
  return { ...t, ...k, ...m };
}

// Energie 1..10 relativ zur Playlist berechnen (Vorschauen sind ähnlich laut gemastert,
// daher Kombination aus Lautheit, Crest, Ereignisdichte, Tempo, Helligkeit).
export function computeEnergy(tracks) {
  const feats = tracks.map(t => t.a ? [
    t.a.loudDb, -t.a.crestDb, t.a.density, Math.min(t.bpm || t.a.bpm, 180), Math.log(t.a.centroid + 1), t.a.groove,
  ] : null);
  const W = [1.0, 0.8, 1.0, 0.6, 0.7, 0.6];
  const valid = feats.filter(Boolean);
  if (!valid.length) return;
  const dims = W.length, mean = Array(dims).fill(0), sd = Array(dims).fill(0);
  for (const f of valid) f.forEach((v, i) => mean[i] += v / valid.length);
  for (const f of valid) f.forEach((v, i) => sd[i] += (v - mean[i]) ** 2 / valid.length);
  for (let i = 0; i < dims; i++) sd[i] = Math.sqrt(sd[i]) || 1;
  tracks.forEach((t, idx) => {
    const f = feats[idx]; if (!f) return;
    let z = 0, ws = 0; f.forEach((v, i) => { z += W[i] * (v - mean[i]) / sd[i]; ws += W[i]; });
    z /= ws;
    // absolute Verankerung: sehr laute/schnelle Musik bleibt hoch, auch in homogenen Listen
    const abs = (t.a.loudDb + 20) / 12 + (Math.min(t.bpm || t.a.bpm, 180) - 110) / 60;
    const e = 5.5 + 2.2 * z + 0.8 * abs;
    t.energy = Math.max(1, Math.min(10, Math.round(e * 10) / 10));
  });
}
