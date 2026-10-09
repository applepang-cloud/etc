/* Piano Bricks — map maker. Turns a melody into a playable song with stages.
 * Sources: Claude's transcription of a song title, a MIDI file, or an audio
 * recording (pitch tracking). No DOM access, so it runs in tests too. */
(function (PB) {
  'use strict';

  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const pc = (m) => ((m % 12) + 12) % 12;
  const midiName = (m) => NAMES[pc(m)] + (Math.floor(m / 12) - 1);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const BEATS_PER_STAGE = 8;

  // ---------- key, chords, range ----------

  // Krumhansl–Kessler key profiles.
  const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10, 11] };

  function pearson(a, b) {
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }

  function detectKey(weights) {
    let best = { score: -Infinity, tonic: 0, minor: false };
    for (let t = 0; t < 12; t++) {
      for (const minor of [false, true]) {
        const prof = minor ? MINOR : MAJOR;
        const score = pearson(weights, weights.map((_, i) => prof[pc(i - t)]));
        if (score > best.score) best = { score, tonic: t, minor };
      }
    }
    best.name = NAMES[best.tonic] + (best.minor ? ' minor' : ' major');
    return best;
  }

  const noteWeights = (notes) => {
    const w = new Array(12).fill(0);
    notes.forEach((n) => { w[pc(n.midi)] += n.len; });
    return w;
  };

  // Pitch-tracking mistakes often land a semitone off; pull them onto the key.
  function snapToKey(notes, key) {
    const scale = (key.minor ? SCALE.minor : SCALE.major).map((d) => pc(d + key.tonic));
    notes.forEach((n) => {
      if (scale.includes(pc(n.midi))) return;
      n.midi += scale.includes(pc(n.midi - 1)) ? -1 : 1;
    });
  }

  // Keep the melody inside ~16 semitones so rows stay tall enough to hit.
  function foldRange(notes, span) {
    if (!notes.length) return;
    const sorted = notes.map((n) => n.midi).sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    const lo = mid - Math.floor(span / 2), hi = lo + span;
    notes.forEach((n) => {
      while (n.midi < lo) n.midi += 12;
      while (n.midi > hi) n.midi -= 12;
    });
  }

  // Best major/minor triad for a pitch-class weight vector (key bonus for diatonic chords).
  function chordFor(w, key) {
    const total = w.reduce((s, v) => s + v, 0);
    if (!total) return null;
    let best = null;
    for (let r = 0; r < 12; r++) {
      for (const minor of [false, true]) {
        const third = pc(r + (minor ? 3 : 4)), fifth = pc(r + 7);
        let s = w[r] * 1.0 + w[third] * 0.85 + w[fifth] * 0.8;
        for (let i = 0; i < 12; i++) if (i !== r && i !== third && i !== fifth) s -= w[i] * 0.25;
        if (key) {
          const scale = (key.minor ? SCALE.minor : SCALE.major).map((d) => pc(d + key.tonic));
          if (scale.includes(r) && scale.includes(third) && scale.includes(fifth)) s *= 1.15;
        }
        if (!best || s > best.s) best = { s, name: NAMES[r] + (minor ? 'm' : '') };
      }
    }
    return best.name;
  }

  // Lenient chord symbol → one the game can voice (major, minor or 7th).
  function normalizeChord(sym) {
    const m = /^\s*([A-Ga-g])([#b♯♭]?)(.*)$/.exec(String(sym || ''));
    if (!m) return null;
    const root = m[1].toUpperCase() + (m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2]);
    const rest = m[3].trim();
    if (/^(m(?!aj)|min|-)/.test(rest)) return root + 'm';
    if (/^7/.test(rest) || /^dom/.test(rest)) return root + '7';
    return root;
  }

  // ---------- melody → song ----------

  // Monophonic clean-up on a half-beat grid.
  function tidy(notes) {
    const out = notes
      .filter((n) => Number.isFinite(n.midi) && n.len > 0)
      .map((n) => ({ midi: Math.round(n.midi), start: Math.round(n.start * 2) / 2, len: Math.max(0.5, Math.round(n.len * 2) / 2) }))
      .sort((a, b) => a.start - b.start || b.midi - a.midi);
    const mono = [];
    for (const n of out) {
      const prev = mono[mono.length - 1];
      if (prev && n.start === prev.start) continue; // keep the higher note of a chord
      if (prev && prev.start + prev.len > n.start) prev.len = n.start - prev.start;
      mono.push(n);
    }
    return mono.filter((n) => n.len > 0);
  }

  function stageTokens(notes, from, to) {
    const toks = [];
    let t = from;
    for (const n of notes) {
      const s = Math.max(n.start, from), e = Math.min(n.start + n.len, to);
      if (e <= s) continue;
      if (s > t) toks.push('R:' + (s - t));
      toks.push(midiName(n.midi) + ':' + (e - s));
      t = e;
    }
    if (t < to) toks.push('R:' + (to - t));
    return toks.join(' ');
  }

  /**
   * src: { title, artist, bpm, notes: [{midi, start, len}] in beats, chords?: [symbol per 2 beats],
   *        source: 'ai' | 'midi' | 'audio' }
   * opts: { stages (max stages), level: 0 easy | 1 normal | 2 hard }
   */
  function buildSong(src, opts) {
    let notes = tidy(src.notes || []);
    if (notes.length < 4) throw new Error('멜로디를 충분히 찾지 못했어요.');
    // Start at the bar holding the first note.
    const shift = Math.floor(notes[0].start / 4) * 4;
    notes.forEach((n) => { n.start -= shift; });
    let chords = (src.chords || []).slice(shift / 2).map(normalizeChord);
    foldRange(notes, 16);

    const key = detectKey(noteWeights(notes));
    const maxStages = clamp(opts.stages || 6, 1, 12);
    const lastBeat = notes[notes.length - 1].start + notes[notes.length - 1].len;
    const count = clamp(Math.ceil(lastBeat / BEATS_PER_STAGE), 1, maxStages);
    const total = count * BEATS_PER_STAGE;
    notes = notes.filter((n) => n.start < total);

    const stages = [], form = [], seen = {};
    for (let s = 0; s < count; s++) {
      const from = s * BEATS_PER_STAGE, to = from + BEATS_PER_STAGE;
      const inStage = notes.filter((n) => n.start < to && n.start + n.len > from);
      const melody = stageTokens(inStage, from, to);
      const chordNames = [];
      for (let j = 0; j < BEATS_PER_STAGE / 2; j++) {
        let c = chords[from / 2 + j];
        if (!c) {
          // Estimate from the melody notes sounding in this 2-beat slot.
          const w = new Array(12).fill(0);
          inStage.forEach((n) => {
            const a = Math.max(n.start, from + j * 2), b = Math.min(n.start + n.len, from + j * 2 + 2);
            if (b > a) w[pc(n.midi)] += b - a;
          });
          c = chordFor(w, key) || chordNames[j - 1] || NAMES[key.tonic] + (key.minor ? 'm' : '');
        }
        chordNames.push(c);
      }
      const sig = melody + '|' + chordNames.join(' ');
      if (seen[sig] === undefined) {
        seen[sig] = stages.length;
        stages.push({ melody, chords: chordNames.join(' ') });
      }
      form.push(seen[sig]);
    }

    return {
      id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      title: String(src.title || '내 노래').slice(0, 60),
      en: String(src.artist || '').slice(0, 60),
      bpm: clamp(Math.round(src.bpm || 100), 50, 200),
      key: key.name,
      stages,
      form,
      level: clamp(opts.level | 0, 0, 2),
      source: src.source,
      custom: true
    };
  }

  // ---------- Claude's transcription ----------

  function claudePrompt(title) {
    return [
      'You transcribe songs into a simple melody chart for a piano brick-breaker game.',
      'Song requested by the player: "' + title.replace(/"/g, "'") + '"',
      '',
      'Reply with only this JSON object:',
      '{"title": string, "artist": string, "bpm": number, "notes": [[pitch, beats], ...], "chords": [string, ...]}',
      '- title/artist: the song\'s usual name and performer, in the song\'s original language.',
      '- bpm: tempo in quarter-note beats per minute.',
      '- notes: the main vocal melody of the most recognizable part (for example verse then chorus), in order,',
      '  48 to 64 beats in total. pitch is like "C4", "F#4", "Bb3", or "R" for a rest. beats is the length in',
      '  quarter-note beats, a multiple of 0.5. Keep pitches between C3 and C6.',
      '- chords: one chord symbol per 2 beats covering the same span (like "C", "Am", "G7").',
      'If you are unsure of exact notes, give your closest version of the tune\'s contour and rhythm.',
      'If you do not recognize the song at all, reply {"error": "unknown"}.',
      'Example: {"title": "Twinkle Twinkle Little Star", "artist": "Traditional", "bpm": 100,',
      ' "notes": [["C4",1],["C4",1],["G4",1],["G4",1],["A4",1],["A4",1],["G4",2]], "chords": ["C","C","F","C"]}'
    ].join('\n');
  }

  function fromClaude(data) {
    if (!data || typeof data !== 'object') throw new Error('답을 읽지 못했어요.');
    if (data.error) throw new Error('이 곡의 멜로디를 몰라요. 제목이나 가수를 바꿔 적어 보세요.');
    if (!Array.isArray(data.notes)) throw new Error('멜로디가 비어 있어요.');
    const notes = [];
    let t = 0;
    data.notes.forEach((item) => {
      const [p, b] = Array.isArray(item) ? item : [item && item.pitch, item && item.beats];
      const len = clamp(Number(b) || 0, 0, 16);
      if (!len) return;
      const name = String(p || 'R').trim().replace('♯', '#').replace('♭', 'b');
      let midi = null;
      if (!/^R/i.test(name)) {
        try { midi = PB.noteToMidi(name.charAt(0).toUpperCase() + name.slice(1)); } catch (e) { midi = null; }
      }
      if (midi !== null) notes.push({ midi, start: t, len });
      t += len;
    });
    return {
      title: data.title,
      artist: data.artist,
      bpm: Number(data.bpm) || 100,
      notes,
      chords: Array.isArray(data.chords) ? data.chords.map(String) : [],
      source: 'ai'
    };
  }

  // ---------- MIDI files ----------

  function parseMidi(buffer) {
    const d = new DataView(buffer);
    let p = 0;
    const str = (n) => {
      let s = '';
      for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i));
      p += n;
      return s;
    };
    const u32 = () => { const v = d.getUint32(p); p += 4; return v; };
    const u16 = () => { const v = d.getUint16(p); p += 2; return v; };
    const vlq = () => {
      let v = 0, b;
      do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80);
      return v;
    };
    if (str(4) !== 'MThd') throw new Error('MIDI 파일이 아니에요.');
    const hlen = u32();
    u16(); // format
    const ntrk = u16(), div = u16();
    p += hlen - 6;
    if (div & 0x8000) throw new Error('이 MIDI 시간 형식(SMPTE)은 지원하지 않아요.');

    let tempo = null, songName = '';
    const groups = {}; // "track:channel" → notes
    for (let t = 0; t < ntrk && p + 8 <= d.byteLength; t++) {
      const id = str(4), len = u32(), end = Math.min(d.byteLength, p + len);
      if (id !== 'MTrk') { p = end; continue; }
      let tick = 0, status = 0, name = '';
      const on = {};
      while (p < end) {
        tick += vlq();
        const b = d.getUint8(p);
        if (b === 0xff) {
          p++;
          const type = d.getUint8(p++), l = vlq();
          if (type === 0x51 && tempo === null && l >= 3) tempo = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2);
          if (type === 0x03) {
            const save = p;
            name = str(Math.min(l, 64));
            p = save;
            if (t === 0 && !songName) songName = name;
          }
          p += l;
          continue;
        }
        if (b === 0xf0 || b === 0xf7) { p++; p += vlq(); continue; }
        if (b & 0x80) { status = b; p++; }
        const type = status & 0xf0, ch = status & 0x0f;
        if (type === 0x90 || type === 0x80) {
          const note = d.getUint8(p++), vel = d.getUint8(p++);
          const k = ch * 128 + note;
          if (type === 0x90 && vel > 0) {
            (on[k] = on[k] || []).push(tick);
          } else if (on[k] && on[k].length) {
            const st = on[k].shift();
            const g = t + ':' + ch;
            (groups[g] = groups[g] || { name, ch, notes: [] }).notes.push({ midi: note, start: st / div, len: (tick - st) / div });
          }
        } else if (type === 0xc0 || type === 0xd0) {
          p += 1;
        } else {
          p += 2;
        }
      }
      Object.keys(groups).forEach((g) => { if (g.startsWith(t + ':') && !groups[g].name) groups[g].name = name; });
      p = end;
    }

    const parts = Object.values(groups).filter((g) => g.ch !== 9 && g.notes.length);
    if (!parts.length) throw new Error('MIDI 파일에 음표가 없어요.');
    const mean = (g) => g.notes.reduce((s, n) => s + n.midi, 0) / g.notes.length;
    // Melody: a part named like one, else the highest part with a real tune in it.
    let melodyPart = parts.find((g) => /melod|vocal|voice|lead|sing|멜로디|보컬|주선율/i.test(g.name) && g.notes.length >= 8);
    if (!melodyPart) {
      const tunes = parts.filter((g) => g.notes.length >= 16);
      melodyPart = (tunes.length ? tunes : parts).sort((a, b) => mean(b) - mean(a))[0];
    }
    const melody = tidy(melodyPart.notes);
    const all = parts.flatMap((g) => g.notes);
    // Chords from every pitched part, two beats at a time.
    const span = Math.max(...all.map((n) => n.start + n.len));
    const key = detectKey(noteWeights(all));
    const chords = [];
    for (let b = 0; b < span; b += 2) {
      const w = new Array(12).fill(0);
      all.forEach((n) => {
        const a = Math.max(n.start, b), e = Math.min(n.start + n.len, b + 2);
        if (e > a) w[pc(n.midi)] += e - a;
      });
      chords.push(chordFor(w, key) || chords[chords.length - 1] || null);
    }
    return {
      title: songName.trim(),
      bpm: tempo ? 60e6 / tempo : 120,
      notes: melody,
      chords,
      source: 'midi'
    };
  }

  // ---------- audio recordings ----------

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = t;
        }
      }
    }
  }

  const pause = () => new Promise((r) => setTimeout(r, 0));

  /**
   * pcm: mono Float32Array at sampleRate sr (about 22 kHz works best).
   * opts: { startSec, maxSec, onProgress(fraction) }
   * Returns { bpm, notes (beats), chords (per 2 beats), source: 'audio' }.
   */
  async function analyzeAudio(pcm, sr, opts) {
    opts = opts || {};
    const N = 2048, hop = 256, bins = N / 2, fps = sr / hop;
    const start = Math.floor(clamp(opts.startSec || 0, 0, pcm.length / sr) * sr);
    const end = Math.min(pcm.length, start + Math.floor((opts.maxSec || 80) * sr));
    const frames = Math.floor((end - start - N) / hop);
    if (frames < fps * 6) throw new Error('분석할 소리가 너무 짧아요 (6초 이상 필요).');

    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    // Melody candidates G3..C6, harmonics weighted toward the fundamental,
    // with a gentle preference for the usual singing range.
    const cands = [];
    for (let m = 55; m <= 84; m++) {
      const f0 = 440 * Math.pow(2, (m - 69) / 12), hs = [];
      for (let h = 1; h <= 6; h++) if (f0 * h < sr / 2 - 100) hs.push([Math.round((f0 * h * N) / sr), Math.pow(0.84, h - 1)]);
      cands.push({ m, hs, prior: Math.exp(-0.5 * ((m - 69) / 12) ** 2) });
    }
    const kLo = Math.ceil((80 * N) / sr), kHi = Math.floor((2000 * N) / sr);
    const binPc = new Int8Array(bins);
    for (let k = 1; k < bins; k++) binPc[k] = pc(Math.round(69 + 12 * Math.log2(((k * sr) / N) / 440)));

    const onset = new Float32Array(frames), pitch = new Int16Array(frames), sal = new Float32Array(frames);
    const energy = new Float32Array(frames), chroma = new Float32Array(frames * 12);
    const re = new Float64Array(N), im = new Float64Array(N), mag = new Float32Array(bins), prev = new Float32Array(bins);

    for (let i = 0; i < frames; i++) {
      const off = start + i * hop;
      for (let j = 0; j < N; j++) { re[j] = pcm[off + j] * win[j]; im[j] = 0; }
      fft(re, im);
      let flux = 0, e = 0;
      for (let k = 0; k < bins; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        e += m * m;
        const lg = Math.log1p(100 * m);
        if (lg > prev[k]) flux += lg - prev[k];
        prev[k] = lg;
        mag[k] = Math.sqrt(m);
      }
      onset[i] = flux;
      energy[i] = e;
      let best = 0, bestS = 0;
      for (const c of cands) {
        let s = 0;
        for (const [k, w] of c.hs) s += w * Math.max(mag[k - 1], mag[k], mag[k + 1] || 0);
        s *= 0.7 + 0.3 * c.prior;
        if (s > bestS) { bestS = s; best = c.m; }
      }
      pitch[i] = best;
      sal[i] = bestS;
      for (let k = kLo; k <= kHi; k++) chroma[i * 12 + binPc[k]] += mag[k];
      if (i % 400 === 0) {
        if (opts.onProgress) opts.onProgress((0.85 * i) / frames);
        await pause();
      }
    }

    // Onset envelope: subtract a moving average, keep the rises.
    const env = new Float32Array(frames);
    for (let i = 0, acc = 0; i < frames; i++) {
      acc += onset[i] - (i >= 16 ? onset[i - 16] : 0);
      env[i] = Math.max(0, onset[i] - acc / Math.min(i + 1, 16));
    }
    const at = (x) => {
      const i = Math.floor(x), f = x - i;
      return i + 1 < frames ? env[i] * (1 - f) + env[i + 1] * f : 0;
    };
    const ac = (lag) => {
      let s = 0;
      for (let i = 0; i + lag < frames; i += 1) s += env[i] * at(i + lag);
      return s / (frames - lag);
    };
    let bpm = 100, bestScore = -1;
    for (let b = 60; b <= 180; b += 0.5) {
      const L = (60 * fps) / b;
      const score = (ac(L) + 0.5 * ac(2 * L) + 0.25 * ac(4 * L)) * Math.exp(-0.5 * (Math.log2(b / 110) / 0.8) ** 2);
      if (score > bestScore) { bestScore = score; bpm = b; }
    }
    // Refine without the tempo prior using longer lags: a 3% error drifts half a beat in 16 beats.
    const coarse = bpm;
    bestScore = -1;
    for (let b = coarse * 0.96; b <= coarse * 1.04; b += 0.05) {
      const L = (60 * fps) / b;
      let score = 0;
      for (let k = 1; k <= 16 && k * L < frames / 2; k *= 2) score += ac(k * L);
      if (score > bestScore) { bestScore = score; bpm = b; }
    }
    bpm = Math.round(bpm * 10) / 10;
    if (opts.onProgress) opts.onProgress(0.92);
    await pause();

    // Beat phase: the offset whose beats line up with the most onsets.
    const L = (60 * fps) / bpm;
    let phase = 0, phaseScore = -1;
    for (let ph = 0; ph < L; ph++) {
      let s = 0;
      for (let x = ph; x < frames; x += L) s += at(x);
      if (s > phaseScore) { phaseScore = s; phase = ph; }
    }

    // Voicing: loud enough and a clear pitch.
    const sortedSal = Array.from(sal).sort((a, b) => a - b);
    const salGate = sortedSal[Math.floor(sortedSal.length * 0.3)];
    const maxE = Math.max(...energy);
    const voiced = (i) => sal[i] > salGate && energy[i] > maxE * 1e-4;
    const envMean = env.reduce((s, v) => s + v, 0) / frames;

    // Eighth-note slots → notes.
    const slot = L / 2;
    const notes = [];
    let cur = null;
    for (let s = 0; phase + (s + 1) * slot <= frames; s++) {
      const a = Math.floor(phase + s * slot), b = Math.floor(phase + (s + 1) * slot);
      const counts = {};
      let v = 0;
      for (let i = a; i < b; i++) if (voiced(i)) { v++; counts[pitch[i]] = (counts[pitch[i]] || 0) + 1; }
      let onsetHere = 0;
      for (let i = Math.max(0, a - 2); i <= Math.min(frames - 1, a + 2); i++) onsetHere = Math.max(onsetHere, env[i]);
      if (v < (b - a) * 0.4) { cur = null; continue; }
      const midi = Number(Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0]);
      if (cur && cur.midi === midi && onsetHere < envMean * 2.5) {
        cur.len += 0.5;
      } else {
        cur = { midi, start: s / 2, len: 0.5 };
        notes.push(cur);
      }
    }

    const key = detectKey(noteWeights(notes));
    snapToKey(notes, key);
    // Merge neighbours that became the same pitch after snapping.
    const merged = [];
    for (const n of notes) {
      const p = merged[merged.length - 1];
      if (p && p.midi === n.midi && p.start + p.len === n.start && n.len <= 0.5) p.len += n.len;
      else merged.push(n);
    }
    // A decaying note drops under the voicing gate before it ends: let it ring
    // through a short gap (half a beat, or a beat after a note of a beat or more).
    for (let i = 0; i + 1 < merged.length; i++) {
      const p = merged[i], gap = merged[i + 1].start - (p.start + p.len);
      if (gap > 0 && (gap <= 0.5 || (gap <= 1 && p.len >= 1))) p.len += gap;
    }

    // Chords from the whole mix, two beats at a time.
    const chords = [];
    for (let c = 0; phase + (c + 1) * 2 * L <= frames; c++) {
      const w = new Array(12).fill(0);
      for (let i = Math.floor(phase + c * 2 * L); i < Math.floor(phase + (c + 1) * 2 * L); i++) {
        for (let k = 0; k < 12; k++) w[k] += chroma[i * 12 + k];
      }
      chords.push(chordFor(w, key) || chords[chords.length - 1] || null);
    }
    if (opts.onProgress) opts.onProgress(1);
    return { bpm, notes: merged, chords, key: key.name, source: 'audio' };
  }

  PB.maker = { buildSong, claudePrompt, fromClaude, parseMidi, analyzeAudio, detectKey, normalizeChord };
})(window.PB = window.PB || {});
