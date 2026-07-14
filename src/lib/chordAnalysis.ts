"use client";
/**
 * chordAnalysis.ts — Chord + Key detection for InstantBandAI
 *
 * Architecture:
 *   1. Goertzel algorithm — exact DFT at specific frequencies (no FFT, correct math)
 *   2. Hann windowing     — spectral leakage suppression
 *   3. Chroma vector      — 12-bin pitch-class energy (summed over octaves 2–7)
 *   4. Key detection      — Krumhansl-Schmuckler profiles, 64 windows across track
 *   5. Chord detection    — beat-synchronous chroma → @tonaljs/tonal Chord.detect()
 *   6. Key constraint     — diatonic chord preference for common-practice bias
 *   7. Annotation         — roman numerals + tonic/subdominant/dominant/chromatic labels
 *
 * Future upgrade path: replace chromaFromSegment() with @spotify/basic-pitch
 * neural net for near-MIDI accuracy (use as optional "deep scan" mode).
 */

import { Chord, Key } from "@tonaljs/tonal";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChordEvent {
  bar: number;
  beat: number;
  chord: string;                                                    // e.g. "Am7", "G", "Dsus4"
  duration: number;                                                 // in beats
  romanNumeral?: string;                                            // e.g. "vi7", "I", "IV"
  chordFunction?: "tonic" | "subdominant" | "dominant" | "chromatic";
  notes?: string[];                                                 // detected pitch classes
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

const FLAT_TO_SHARP: Record<string, string> = {
  Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#",
};

// Krumhansl-Schmuckler 1990 key profiles
const KK_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const KK_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

const MAX_WINDOW = 8192; // samples per chroma window (~186ms @ 44100 Hz)

// ─── DSP Primitives ──────────────────────────────────────────────────────────

/**
 * Goertzel algorithm: compute DFT power at a single exact frequency in O(N).
 * Correct for any real-valued signal — no FFT bin rounding.
 */
function goertzel(data: Float32Array, freq: number, sampleRate: number): number {
  const N = data.length;
  if (N === 0) return 0;
  const omega = 2 * Math.PI * freq / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < N; i++) {
    const s0 = data[i] + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - s1 * s2 * coeff);
}

/** Hann window — suppresses spectral leakage for non-integer frequency bins */
function hannWindow(data: Float32Array): Float32Array {
  const N = data.length;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = data[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  }
  return out;
}

// ─── Chroma Extraction ───────────────────────────────────────────────────────

/**
 * Extract a 12-bin chroma vector from a segment of audio.
 * Uses Goertzel at each MIDI pitch, summed over octaves 2–7, with Hann windowing.
 * Returns L1-normalized chroma (sum = 1).
 */
export function chromaFromSegment(
  data: Float32Array,
  sampleRate: number,
  startSample: number,
  numSamples: number,
): number[] {
  const windowSize = Math.min(numSamples, MAX_WINDOW);
  const end = Math.min(startSample + windowSize, data.length);
  if (end <= startSample) return new Array(12).fill(0);

  const slice = hannWindow(data.slice(startSample, end));
  const chroma = new Array(12).fill(0);

  for (let note = 0; note < 12; note++) {
    let energy = 0;
    for (let octave = 2; octave <= 7; octave++) {
      const midi = 60 + note + (octave - 4) * 12;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      if (freq >= sampleRate / 2 - 20) continue;
      energy += goertzel(slice, freq, sampleRate);
    }
    chroma[note] = Math.sqrt(energy); // sqrt for perceptual scaling
  }

  // L1 normalize
  const sum = chroma.reduce((a, b) => a + b, 0) || 1;
  return chroma.map(v => v / sum);
}

// ─── Key Detection ───────────────────────────────────────────────────────────

/**
 * Detect musical key using Krumhansl-Schmuckler correlation.
 * Samples 64 evenly-spaced windows, builds global chroma, correlates with
 * all 24 major/minor key profiles.
 */
export function detectKey(audioBuffer: AudioBuffer): string {
  const data = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  const N_WIN = 64;
  const step = Math.floor(data.length / N_WIN);
  const globalChroma = new Array(12).fill(0);

  for (let w = 0; w < N_WIN; w++) {
    const c = chromaFromSegment(data, sr, w * step, MAX_WINDOW);
    for (let i = 0; i < 12; i++) globalChroma[i] += c[i];
  }

  const maxG = Math.max(...globalChroma, 1e-9);
  const norm = globalChroma.map(v => v / maxG);

  let bestScore = -Infinity, bestKey = "C major";
  for (let root = 0; root < 12; root++) {
    for (const [mode, prof] of [
      ["major", KK_MAJOR],
      ["minor", KK_MINOR],
    ] as const) {
      let score = 0;
      for (let i = 0; i < 12; i++) {
        score += norm[(i + root) % 12] * prof[i];
      }
      if (score > bestScore) {
        bestScore = score;
        bestKey = `${NOTE_NAMES[root]} ${mode}`;
      }
    }
  }
  return bestKey;
}

// ─── Chord Matching ──────────────────────────────────────────────────────────

/** Format Tonal.js chord name for display — strip trailing M from pure major triads */
function formatChord(name: string): string {
  // "CM" → "C", "CM/E" → "C/E", leave "Am", "G7", "Fmaj7" as-is
  return name.replace(/^([A-G][b#]?)M(\/.+)?$/, "$1$2").trim();
}

/** Get top N pitch classes by chroma energy */
function topPitchClasses(chroma: number[], n: number): string[] {
  return chroma
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map(({ i }) => NOTE_NAMES[i]);
}

/** Match a chroma vector to the best chord name using @tonaljs/tonal */
function matchChord(chroma: number[], diatonicRoots: Set<string>): { chord: string; notes: string[] } {
  // Try 4, 3, 5, 2 pitch classes in order — find first non-empty Chord.detect result
  for (const n of [4, 3, 5, 2]) {
    const notes = topPitchClasses(chroma, n);
    const candidates = Chord.detect(notes);
    if (candidates.length > 0) {
      // Prefer diatonic chords over chromatic ones
      const diatonic = candidates.find(c => {
        const tonic = c.match(/^([A-G][b#]?)/)?.[1] ?? "";
        return diatonicRoots.has(tonic) || diatonicRoots.has(FLAT_TO_SHARP[tonic] ?? tonic);
      });
      const raw = diatonic ?? candidates[0];
      return { chord: formatChord(raw), notes };
    }
  }

  // Fallback: root + major/minor inferred from chroma
  const root = topPitchClasses(chroma, 1)[0];
  const rootIdx = NOTE_NAMES.indexOf(root);
  const minorThird = chroma[(rootIdx + 3) % 12];
  const majorThird = chroma[(rootIdx + 4) % 12];
  const quality = minorThird > majorThird * 1.15 ? "m" : "";
  return { chord: root + quality, notes: [root] };
}

// ─── Roman Numerals + Function ───────────────────────────────────────────────

/** Parse key string into root + mode */
function parseKey(keyStr: string): { root: string; mode: "major" | "minor" } | null {
  const parts = keyStr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const mode = parts[parts.length - 1].toLowerCase() as "major" | "minor";
  const root = parts.slice(0, -1).join(" ");
  if (mode !== "major" && mode !== "minor") return null;
  return { root, mode };
}

/** Get the Tonal.js scale notes for a key */
function getScaleNotes(keyStr: string): string[] {
  const parsed = parseKey(keyStr);
  if (!parsed) return [];
  try {
    if (parsed.mode === "major") return [...(Key.majorKey(parsed.root).scale ?? [])];
    return [...(Key.minorKey(parsed.root).natural.scale ?? [])];
  } catch { return []; }
}

/** Get diatonic chord list for a key */
export function getDiatonicChords(keyStr: string): string[] {
  const parsed = parseKey(keyStr);
  if (!parsed) return [];
  try {
    if (parsed.mode === "major") return [...(Key.majorKey(parsed.root).chords ?? [])];
    return [...(Key.minorKey(parsed.root).natural.chords ?? [])];
  } catch { return []; }
}

const ROMAN_NAMES = ["I", "II", "III", "IV", "V", "VI", "VII"];

/** Roman numeral for a chord in the context of a key */
export function getRomanNumeral(chord: string, keyStr: string): string {
  const scaleNotes = getScaleNotes(keyStr);
  if (!scaleNotes.length) return "";
  const chordRoot = chord.match(/^([A-G][b#]?)/)?.[1] ?? "";
  if (!chordRoot) return "";

  const normalizedRoot = FLAT_TO_SHARP[chordRoot] ?? chordRoot;
  const idx = scaleNotes.findIndex(n => {
    const norm = FLAT_TO_SHARP[n] ?? n;
    return norm === normalizedRoot;
  });
  if (idx < 0) return ""; // chromatic chord

  const roman = ROMAN_NAMES[idx] ?? "";
  // Lowercase for minor-quality chords
  const isMinor = /m(?!aj)/.test(chord.slice(chordRoot.length));
  const isDim = chord.includes("dim") || chord.includes("°");
  if (isMinor || isDim) return roman.toLowerCase() + (isDim ? "°" : "");
  return roman;
}

/** Chord function category for color coding */
export function getChordFunction(
  chord: string,
  keyStr: string,
): "tonic" | "subdominant" | "dominant" | "chromatic" {
  const rn = getRomanNumeral(chord, keyStr);
  if (!rn) return "chromatic";
  const lower = rn.replace("°", "");
  if (["I", "i", "III", "iii", "VI", "vi"].includes(lower)) return "tonic";
  if (["II", "ii", "IV", "iv"].includes(lower)) return "subdominant";
  if (["V", "v", "VII", "vii"].includes(lower)) return "dominant";
  return "chromatic";
}

// ─── Main Chord Detection ─────────────────────────────────────────────────────

/**
 * Detect chords beat-by-beat from an AudioBuffer.
 * Returns run-length-encoded ChordEvent[] with roman numerals + function labels.
 */
export function detectChords(
  audioBuffer: AudioBuffer,
  bpm: number,
  keyStr: string,
): ChordEvent[] {
  const data = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  const samplesPerBeat = Math.floor((60 / bpm) * sr);
  const totalBeats = Math.floor(data.length / samplesPerBeat);

  // Build diatonic root set for preference scoring
  const scaleNotes = getScaleNotes(keyStr);
  const diatonicRoots = new Set(
    scaleNotes.map(n => FLAT_TO_SHARP[n] ?? n),
  );

  // Per-beat chroma → chord
  const beatChords: string[] = [];
  const beatNotes: string[][] = [];

  for (let beat = 0; beat < totalBeats; beat++) {
    const chroma = chromaFromSegment(data, sr, beat * samplesPerBeat, samplesPerBeat);
    const { chord, notes } = matchChord(chroma, diatonicRoots);
    beatChords.push(chord);
    beatNotes.push(notes);
  }

  // Run-length encode → ChordEvent[]
  const events: ChordEvent[] = [];
  let i = 0;
  while (i < beatChords.length) {
    let j = i + 1;
    while (j < beatChords.length && beatChords[j] === beatChords[i]) j++;
    events.push({
      bar: Math.floor(i / 4),
      beat: i % 4,
      chord: beatChords[i],
      duration: j - i,
      notes: beatNotes[i],
    });
    i = j;
  }

  // Annotate
  return events.map(e => ({
    ...e,
    romanNumeral: getRomanNumeral(e.chord, keyStr),
    chordFunction: getChordFunction(e.chord, keyStr),
  }));
}

// ─── Transposition ───────────────────────────────────────────────────────────

const CHROMATIC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

/**
 * Transpose a single chord by N semitones.
 * Preserves chord quality (m, maj7, sus4, dim, etc).
 * Uses sharps for all accidentals.
 */
export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;
  const match = chord.match(/^([A-G][b#]?)(.*)/);
  if (!match) return chord;
  const [, tonic, rest] = match;
  const normalized = FLAT_TO_SHARP[tonic] ?? tonic;
  const idx = CHROMATIC.indexOf(normalized);
  if (idx < 0) return chord;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return CHROMATIC[newIdx] + rest;
}

/** Transpose an entire key string */
export function transposeKey(keyStr: string, semitones: number): string {
  if (semitones === 0) return keyStr;
  const parsed = parseKey(keyStr);
  if (!parsed) return keyStr;
  const normalized = FLAT_TO_SHARP[parsed.root] ?? parsed.root;
  const idx = CHROMATIC.indexOf(normalized);
  if (idx < 0) return keyStr;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return `${CHROMATIC[newIdx]} ${parsed.mode}`;
}
