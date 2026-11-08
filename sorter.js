// Übergangsbewertung und Reihenfolge-Optimierung (offener Pfad, asymmetrische Kosten)

export function camelotParts(code) {
  const m = /^(\d{1,2})([AB])$/.exec(code || '');
  return m ? { n: +m[1], l: m[2] } : null;
}

// 0 = perfekt, 1 = schlecht
export function harmonicCost(a, b) {
  const A = camelotParts(a.camelot), B = camelotParts(b.camelot);
  if (!A || !B) return 0.5;
  const up = (B.n - A.n + 12) % 12, dn = Math.min(up, 12 - up);
  let c;
  if (A.l === B.l) {
    if (dn === 0) c = 0;
    else if (dn === 1) c = 0.12;          // ±1: klassischer Harmonic-Mix
    else if (dn === 2) c = 0.45;          // ±2: "Energy Boost"
    else if (up === 7) c = 0.5;           // +7: Halbton-Hochschaltung
    else c = 0.6 + 0.4 * (dn - 2) / 4;
  } else {
    if (dn === 0) c = 0.18;               // Dur/Moll-Wechsel (Paralleltonart)
    else if (dn === 1 && ((A.l === 'A' && up === 1) || (A.l === 'B' && up === 11))) c = 0.4; // Diagonal
    else c = 0.75 + 0.25 * Math.min(1, dn / 4);
  }
  // unsichere Tonarten dämpfen
  const conf = Math.min(a.keyConf ?? 1, b.keyConf ?? 1, 1);
  return conf * c + (1 - conf) * 0.4;
}

export function tempoRatioInfo(a, b) {
  if (!a.bpm || !b.bpm) return { pct: 10, mult: 1 };
  let best = { pct: Infinity, mult: 1 };
  for (const m of [1, 2, 0.5]) {
    const pct = Math.abs(Math.log2((b.bpm * m) / a.bpm)) * 100 * Math.LN2; // ≈ Prozent
    if (pct < best.pct) best = { pct, mult: m };
  }
  return best;
}

export function tempoCost(a, b) {
  const { pct, mult } = tempoRatioInfo(a, b);
  // >~10 % ist ohne Pitch-Änderung kaum mischbar -> über 1 hinaus bestrafen (max 1,5)
  let c = pct <= 1.5 ? pct / 1.5 * 0.08 : Math.min(1.5, 0.08 + (pct - 1.5) / 9);
  if (mult !== 1) c = Math.min(1.5, c + 0.18);
  return c;
}

export function energyCost(a, b, mode) {
  const ea = a.energy ?? 5, eb = b.energy ?? 5, d = eb - ea;
  let c = Math.min(1, Math.abs(d) / 4);
  if (mode === 'build') {
    if (d < 0) c = Math.min(1, c * 2 + 0.15);
    if (d > 0) c *= 0.5;
  } else if (mode === 'winddown') {
    if (d > 0) c = Math.min(1, c * 2 + 0.15);
    if (d < 0) c *= 0.5;
  } else if (mode === 'peak') {
    if (d > 0) c *= 0.55;
    if (d < 0) {
      if (ea >= 6.5) c *= 0.65;
      else c = Math.min(1, c * 1.75 + 0.1);
    }
    if (ea >= 7 && eb >= 7 && Math.abs(d) <= 1) c *= 0.45;
  }
  return c;
}

export function grooveCost(a, b) {
  const meter = (a.meter && b.meter && a.meter !== b.meter) ? 0.6 : 0;
  const g = Math.abs((a.groove ?? 0.5) - (b.groove ?? 0.5));
  return Math.min(1, meter + g);
}

/** Stimmungskoordinaten 0..1 aus Analyse (Tonart, Timbre, Energie, Groove). */
export function trackMoodCoords(t) {
  const a = t.a || {};
  const cp = camelotParts(t.camelot);
  const major = cp ? cp.l === 'B' : a.keyMode === 'major';
  const cent = a.centroid ?? 2200;
  const bass = a.bassRatio ?? 0.32;
  const warmth = Math.max(0, Math.min(1, bass * 1.4 + (1 - cent / 4500) * 0.55));
  const intensity = Math.max(0, Math.min(1, ((t.energy ?? 5) - 1) / 9));
  const pulse = Math.max(0, Math.min(1, t.groove ?? a.groove ?? 0.5));
  const density = Math.max(0, Math.min(1, (a.density ?? 2) / 5));
  const valence = Math.max(0, Math.min(1, (major ? 0.58 : 0.38) + (cent - 1200) / 8000));
  return { warmth, intensity, pulse, valence, density, major };
}

/** Sanfte Stimmungskontinuität (kein erzwungener Energiebogen). */
export function moodCost(a, b) {
  const A = trackMoodCoords(a), B = trackMoodCoords(b);
  const blend = (x, y, span) => Math.min(1, Math.abs(x - y) / span);
  let c = 0.22 * blend(A.warmth, B.warmth, 0.38)
    + 0.2 * blend(A.intensity, B.intensity, 0.42)
    + 0.18 * blend(A.pulse, B.pulse, 0.48)
    + 0.22 * blend(A.valence, B.valence, 0.36)
    + 0.18 * blend(A.density, B.density, 0.55);
  if (A.major !== B.major) c = Math.min(1, c + 0.18);
  return c;
}

export function transitionCost(a, b, w, mode) {
  const energyMode = mode === 'mood' || mode === 'flow' ? 'flow' : mode;
  const parts = {
    key: harmonicCost(a, b),
    tempo: tempoCost(a, b),
    energy: energyCost(a, b, energyMode),
    groove: grooveCost(a, b),
  };
  if (mode === 'mood') parts.mood = moodCost(a, b);
  const wmood = mode === 'mood' ? 1.35 : 0;
  const ws = w.key + w.tempo + w.energy + w.groove + wmood || 1;
  const total = (w.key * parts.key + w.tempo * parts.tempo + w.energy * parts.energy + w.groove * parts.groove + wmood * (parts.mood ?? 0)) / ws;
  return { total, parts };
}

export function fitScore(cost) { return Math.max(0, Math.round(100 * (1 - cost))); }

/** Ø Passung (fitScore) entlang einer Permutation – entspricht der Anzeige in der App. */
export function averageTransitionFit(tracks, perm, w, mode) {
  let s = 0, n = 0;
  for (let i = 0; i + 1 < perm.length; i++) {
    s += fitScore(transitionCost(tracks[perm[i]], tracks[perm[i + 1]], w, mode).total);
    n++;
  }
  return n ? Math.round(s / n) : null;
}

// Liefert eine Permutation der Indizes 0..n-1
export function optimizeOrder(tracks, w, mode, opts = {}) {
  const n = tracks.length;
  if (n <= 2) return tracks.map((_, i) => i);
  const C = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] = i === j ? 0 : transitionCost(tracks[i], tracks[j], w, mode).total;

  const startBias = (i) => {
    const e = tracks[i].energy ?? 5;
    if (mode === 'build') return (e - 1) / 9 * 0.6;
    if (mode === 'winddown') return (10 - e) / 9 * 0.6;
    if (mode === 'peak') return (e - 1) / 9 * 0.75;
    if (mode === 'mood') {
      const { intensity, valence } = trackMoodCoords(tracks[i]);
      return Math.abs(intensity - 0.45) * 0.5 + Math.abs(valence - 0.52) * 0.35;
    }
    return 0;
  };
  const endBias = (i) => {
    const e = tracks[i].energy ?? 5;
    if (mode === 'peak') return Math.max(0, (e - 5.5) / 4.5) * 0.55;
    if (mode === 'winddown') return Math.max(0, (e - 4.5) / 5.5) * 0.35;
    if (mode === 'mood') {
      const { intensity, valence } = trackMoodCoords(tracks[i]);
      return Math.abs(intensity - 0.4) * 0.4 + Math.abs(valence - 0.48) * 0.3;
    }
    return 0;
  };
  const pathCost = (p) => {
    let s = startBias(p[0]);
    if (p.length) s += endBias(p[p.length - 1]);
    for (let i = 0; i + 1 < p.length; i++) s += C[p[i]][p[i + 1]];
    return s;
  };

  const starts = opts.fixedStart != null ? [opts.fixedStart] : [...Array(n).keys()];
  let best = null, bestCost = Infinity;
  for (const s of starts) {
    const used = new Uint8Array(n); used[s] = 1; const p = [s];
    for (let k = 1; k < n; k++) {
      const last = p[p.length - 1]; let bj = -1, bc = Infinity;
      for (let j = 0; j < n; j++) if (!used[j] && C[last][j] < bc) { bc = C[last][j]; bj = j; }
      used[bj] = 1; p.push(bj);
    }
    const c = pathCost(p);
    if (c < bestCost) { bestCost = c; best = p; }
  }

  const auto = !!opts.auto;
  const deadline = Date.now() + (opts.timeMs ?? (auto ? 45000 : 2000));
  const orMax = auto ? Math.min(Math.max(1, n - 1), opts.orOptMaxLen ?? 4) : 3;
  const lo = opts.fixedStart != null ? 1 : 0;
  const sb = (p) => startBias(p[0]);
  const costOf = (p) => pathCost(p);
  let p = best;
  let staleRounds = 0;
  while (Date.now() < deadline) {
    let improved = false;
    // 2-opt
    const fwd = new Float64Array(n), bwd = new Float64Array(n);
    for (let k = 1; k < n; k++) { fwd[k] = fwd[k - 1] + C[p[k - 1]][p[k]]; bwd[k] = bwd[k - 1] + C[p[k]][p[k - 1]]; }
    outer2: for (let i = lo; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = (i > 0 ? C[p[i - 1]][p[i]] : 0) + (fwd[j] - fwd[i]) + (j + 1 < n ? C[p[j]][p[j + 1]] : 0) + (i === 0 ? sb(p) : 0);
        const after = (i > 0 ? C[p[i - 1]][p[j]] : 0) + (bwd[j] - bwd[i]) + (j + 1 < n ? C[p[i]][p[j + 1]] : 0) + (i === 0 ? startBias(p[j]) : 0);
        if (after < before - 1e-9) {
          p = p.slice(0, i).concat(p.slice(i, j + 1).reverse(), p.slice(j + 1)); improved = true; break outer2;
        }
      }
    }
    if (improved) { staleRounds = 0; continue; }
    // Or-opt
    outerO: for (let len = 1; len <= orMax; len++) {
      for (let i = lo; i + len <= n; i++) {
        const segS = p[i], segE = p[i + len - 1];
        const prev = i > 0 ? p[i - 1] : -1, next = i + len < n ? p[i + len] : -1;
        let removeGain = (prev >= 0 ? C[prev][segS] : sb(p)) + (next >= 0 ? C[segE][next] : 0);
        removeGain -= (prev >= 0 && next >= 0) ? C[prev][next] : (prev < 0 && next >= 0 ? startBias(next) : 0);
        const rest = p.slice(0, i).concat(p.slice(i + len));
        for (let j = lo; j <= rest.length; j++) {
          if (j === i) continue;
          const a = j > 0 ? rest[j - 1] : -1, b = j < rest.length ? rest[j] : -1;
          let add = (a >= 0 ? C[a][segS] : startBias(segS)) + (b >= 0 ? C[segE][b] : 0);
          add -= (a >= 0 && b >= 0) ? C[a][b] : (a < 0 && b >= 0 ? startBias(b) : 0);
          if (add < removeGain - 1e-9) {
            p = rest.slice(0, j).concat(p.slice(i, i + len), rest.slice(j)); improved = true; break outerO;
          }
        }
        if (!auto && Date.now() > deadline) break outerO;
      }
    }
    if (improved) { staleRounds = 0; continue; }
    if (auto) {
      const base = costOf(p);
      outerSwap: for (let i = lo; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const np = p.slice();
          const ti = np[i]; np[i] = np[j]; np[j] = ti;
          if (costOf(np) < base - 1e-9) { p = np; improved = true; break outerSwap; }
        }
      }
    }
    if (improved) { staleRounds = 0; continue; }
    staleRounds++;
    if (!auto || staleRounds >= 2) break;
  }
  best = p;
  return best;
}
