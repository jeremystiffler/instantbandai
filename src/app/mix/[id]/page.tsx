"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

// ─── Types ──────────────────────────────────────────────────────────────────
type GenerateStem = "drums" | "bass" | "guitar" | "keys" | "strings" | "other";

interface Stems {
  vocals?: string;
  bass?: string;
  drums?: string;
  guitar?: string;
  piano?: string;
  keys?: string;
  strings?: string;
  other?: string;
}

interface ChordEvent {
  bar: number;
  beat: number;
  chord: string;
  duration: number; // in beats
}

interface Generation {
  id: string;
  status: string;
  sourceUrl: string;
  stems: Stems | null;
  bpm: number | null;
  key: string | null;
  chords: string | null;
  mode?: string | null;
  stemSliders?: Record<GenerateStem, number> | null;
}

const GENERATE_STEMS: GenerateStem[] = ["drums", "bass", "guitar", "keys", "strings", "other"];
const STEM_LABELS: Record<GenerateStem, string> = {
  drums: "🥁 Drums", bass: "🎸 Bass", guitar: "🎸 Guitar",
  keys: "🎹 Keys", strings: "🎻 Strings", other: "✨ Other",
};

function sliderLabel(val: number) {
  if (val <= 15) return "Original";
  if (val <= 40) return "Close";
  if (val <= 65) return "Blend";
  if (val <= 85) return "Inspired";
  return "Creative";
}

interface TrackState {
  id: string;
  label: string;
  emoji: string;
  color: string;
  url: string | null;
  volume: number;
  muted: boolean;
  soloed: boolean;
  isClick?: boolean;
  isOriginal?: boolean;
}

// ─── BPM Detection ──────────────────────────────────────────────────────────
async function detectBPM(audioBuffer: AudioBuffer): Promise<number> {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
  const energies: number[] = [];

  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) energy += data[i + j] ** 2;
    energies.push(energy / windowSize);
  }

  // Compute autocorrelation for BPM range 60–200
  const minLag = Math.floor((60 / 200) * (sampleRate / windowSize));
  const maxLag = Math.floor((60 / 60) * (sampleRate / windowSize));
  let bestCorr = -Infinity, bestLag = minLag;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < energies.length - lag; i++) {
      corr += energies[i] * energies[i + lag];
    }
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  const bpm = 60 / (bestLag * windowSize / sampleRate);
  // Round to nearest 0.5
  return Math.round(bpm * 2) / 2;
}

// ─── Key Detection via Chromagram ───────────────────────────────────────────
const KEY_PROFILES = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function detectKey(audioBuffer: AudioBuffer): string {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const fftSize = 4096;
  const chroma = new Array(12).fill(0);

  // Sample windows across the track
  const step = Math.floor(data.length / 32);
  for (let start = 0; start + fftSize < data.length; start += step) {
    const slice = data.slice(start, start + fftSize);
    // Simple DFT for chromagram (optimized subset)
    for (let note = 0; note < 12; note++) {
      // Map note to frequency bins
      for (let octave = 2; octave <= 6; octave++) {
        const freq = 261.63 * Math.pow(2, (note + (octave - 4) * 12) / 12);
        const bin = Math.round((freq * fftSize) / sampleRate);
        if (bin >= fftSize / 2) continue;
        let real = 0, imag = 0;
        for (let n = 0; n < Math.min(fftSize, 512); n++) {
          const angle = (2 * Math.PI * bin * n) / fftSize;
          real += slice[n] * Math.cos(angle);
          imag -= slice[n] * Math.sin(angle);
        }
        chroma[note] += Math.sqrt(real * real + imag * imag);
      }
    }
  }

  // Normalize
  const max = Math.max(...chroma);
  const norm = chroma.map(v => v / max);

  // Correlate against key profiles
  let bestScore = -Infinity, bestKey = "C major";
  for (let root = 0; root < 12; root++) {
    for (const [mode, profile] of Object.entries(KEY_PROFILES)) {
      let score = 0;
      for (let i = 0; i < 12; i++) score += norm[(i + root) % 12] * profile[i];
      if (score > bestScore) {
        bestScore = score;
        bestKey = `${NOTE_NAMES[root]} ${mode}`;
      }
    }
  }
  return bestKey;
}

// ─── Chord Detection from Chromagram ────────────────────────────────────────
const CHORD_TEMPLATES: Record<string, number[]> = {
  "maj":  [1,0,0,0,1,0,0,1,0,0,0,0],
  "min":  [1,0,0,1,0,0,0,1,0,0,0,0],
  "7":    [1,0,0,0,1,0,0,1,0,0,1,0],
  "maj7": [1,0,0,0,1,0,0,1,0,0,0,1],
  "min7": [1,0,0,1,0,0,0,1,0,0,1,0],
  "sus2": [1,0,1,0,0,0,0,1,0,0,0,0],
  "sus4": [1,0,0,0,0,1,0,1,0,0,0,0],
  "dim":  [1,0,0,1,0,0,1,0,0,0,0,0],
  "aug":  [1,0,0,0,1,0,0,0,1,0,0,0],
};

function detectChords(audioBuffer: AudioBuffer, bpm: number): ChordEvent[] {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const secondsPerBeat = 60 / bpm;
  const samplesPerBeat = Math.floor(secondsPerBeat * sampleRate);
  const totalBeats = Math.floor(data.length / samplesPerBeat);
  const chords: ChordEvent[] = [];
  let lastChord = "";
  let chordStart = 0;
  let chordDuration = 0;

  for (let beat = 0; beat < totalBeats; beat++) {
    const start = beat * samplesPerBeat;
    const slice = data.slice(start, start + samplesPerBeat);
    const fftSize = Math.min(2048, samplesPerBeat);

    // Build chromagram for this beat
    const chroma = new Array(12).fill(0);
    for (let note = 0; note < 12; note++) {
      for (let octave = 3; octave <= 5; octave++) {
        const freq = 261.63 * Math.pow(2, (note + (octave - 4) * 12) / 12);
        const bin = Math.round((freq * fftSize) / sampleRate);
        if (bin >= fftSize / 2) continue;
        let real = 0, imag = 0;
        const limit = Math.min(fftSize, slice.length);
        for (let n = 0; n < limit; n += 4) { // stride for speed
          const angle = (2 * Math.PI * bin * n) / fftSize;
          real += slice[n] * Math.cos(angle);
          imag -= slice[n] * Math.sin(angle);
        }
        chroma[note] += Math.sqrt(real * real + imag * imag);
      }
    }

    const max = Math.max(...chroma, 0.001);
    const norm = chroma.map(v => v / max);

    // Match to chord template
    let bestScore = -Infinity, bestChord = "N/C";
    for (let root = 0; root < 12; root++) {
      for (const [type, template] of Object.entries(CHORD_TEMPLATES)) {
        let score = 0;
        for (let i = 0; i < 12; i++) score += norm[(i + root) % 12] * template[i];
        if (score > bestScore) {
          bestScore = score;
          const suffix = type === "maj" ? "" : type === "min" ? "m" : type;
          bestChord = `${NOTE_NAMES[root]}${suffix}`;
        }
      }
    }

    const bar = Math.floor(beat / 4);
    const beatInBar = beat % 4;

    if (bestChord !== lastChord) {
      if (lastChord && chordDuration > 0) {
        chords.push({ bar: chordStart, beat: 0, chord: lastChord, duration: chordDuration });
      }
      lastChord = bestChord;
      chordStart = bar;
      chordDuration = 1;
    } else {
      chordDuration++;
    }
  }

  if (lastChord && chordDuration > 0) {
    chords.push({ bar: chordStart, beat: 0, chord: lastChord, duration: chordDuration });
  }

  // Merge very short chords (< 2 beats) into neighbors
  return chords.filter((c, i) => c.duration >= 2 || i === 0).slice(0, 64);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function MixPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingStatus, setPollingStatus] = useState<string>("");
  const [stemProgress, setStemProgress] = useState<{ completed: number; total: number } | null>(null);
  const [stemStatuses, setStemStatuses] = useState<Record<string, string>>({});
  const [stemSliders, setStemSliders] = useState<Record<GenerateStem, number>>({
    drums: 0, bass: 0, guitar: 0, keys: 0, strings: 0, other: 0,
  });
  const [rerenderingStem, setRerenderingStem] = useState<GenerateStem | null>(null);

  const [bpm, setBpm] = useState<number | null>(null);
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [chords, setChords] = useState<ChordEvent[]>([]);
  const [editingChords, setEditingChords] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [analysisDoing, setAnalysisDoing] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(false);

  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodes = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const gainNodes = useRef<Map<string, GainNode>>(new Map());
  const audioBuffers = useRef<Map<string, AudioBuffer>>(new Map());
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const clickBufferRef = useRef<AudioBuffer | null>(null);

  // ── Fetch generation ────────────────────────────────────────────────────
  const fetchGeneration = useCallback(async () => {
    const res = await fetch(`/api/status/${id}`);
    const data = await res.json();
    setGeneration(data);

    if (data.status === "completed" && data.stems) {
      setLoading(false);
      const stemObj: Stems = typeof data.stems === "string" ? JSON.parse(data.stems) : data.stems;
      if (data.bpm) setBpm(data.bpm);
      if (data.key) setDetectedKey(data.key);
      if (data.chords) {
        try { setChords(JSON.parse(data.chords)); } catch {}
      }
      if (data.stemSliders) {
        const sl = typeof data.stemSliders === "string" ? JSON.parse(data.stemSliders) : data.stemSliders;
        setStemSliders(prev => ({ ...prev, ...sl }));
      }
      const extraArr = data.extraStems
        ? (typeof data.extraStems === "string" ? JSON.parse(data.extraStems) : data.extraStems)
        : [];
      buildTracks(stemObj, data.sourceUrl, extraArr);

      // Auto-run BPM + key analysis if not already stored
      if (!data.bpm || !data.key) {
        setAutoAnalyze(true);
      }
    } else if (data.status === "failed") {
      setLoading(false);
      setPollingStatus("Generation failed. Please try again.");
    } else {
      if (data.stemProgress) setStemProgress(data.stemProgress);
      if (data.stemStatuses) setStemStatuses(data.stemStatuses);
      setPollingStatus(`Processing… ${data.status}`);
      setTimeout(fetchGeneration, 1500);
    }
  }, [id]);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/");
    if (authStatus === "authenticated") fetchGeneration();
  }, [authStatus, fetchGeneration]);

  // Auto-trigger analysis once generation loads and BPM/key are missing
  useEffect(() => {
    if (autoAnalyze && !analysisDoing && !analysisReady) {
      setAutoAnalyze(false);
      runAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze]);

  // ── Build track list ─────────────────────────────────────────────────────
  function buildTracks(stems: Stems, sourceUrl: string, extraStemsArr: string[] = []) {
    // Melody / Style mode — single fullmix output
    if ((stems as Record<string, string>).fullmix) {
      return [
        { id: "fullmix", label: "Full Mix", emoji: "🎼", color: "#6366f1", url: (stems as Record<string, string>).fullmix, volume: 90, muted: false, soloed: false },
      ];
    }
    const EXTRA_COLORS = ["#f43f5e","#fb923c","#facc15","#34d399","#22d3ee","#a78bfa","#f472b6","#94a3b8","#c084fc","#4ade80"];
    const list: TrackState[] = [
      { id: "drums",    label: "Drums",    emoji: "🥁", color: "#ef4444", url: stems.drums    ?? null, volume: 80, muted: false, soloed: false },
      { id: "bass",     label: "Bass",     emoji: "🎸", color: "#f97316", url: stems.bass     ?? null, volume: 80, muted: false, soloed: false },
      { id: "guitar",   label: "Guitar",   emoji: "🎸", color: "#eab308", url: stems.guitar   ?? null, volume: 80, muted: false, soloed: false },
      { id: "keys",     label: "Keys",     emoji: "🎹", color: "#22c55e", url: stems.keys ?? (stems as Record<string,string>).piano ?? null, volume: 80, muted: false, soloed: false },
      { id: "strings",  label: "Strings",  emoji: "🎻", color: "#06b6d4", url: stems.strings  ?? null, volume: 80, muted: false, soloed: false },
      { id: "vocals",   label: "Vocals",   emoji: "🎤", color: "#3b82f6", url: stems.vocals   ?? null, volume: 80, muted: false, soloed: false },
      { id: "other",    label: "Other",    emoji: "🎵", color: "#8b5cf6", url: stems.other    ?? null, volume: 80, muted: false, soloed: false },
      // Extra instrument tracks
      ...extraStemsArr.map((stemId, i) => ({
        id: stemId,
        label: stemId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        emoji: "🎼",
        color: EXTRA_COLORS[i % EXTRA_COLORS.length],
        url: (stems as Record<string, string | null>)[stemId] ?? null,
        volume: 80,
        muted: false,
        soloed: false,
      })),
      { id: "click",    label: "Click",    emoji: "🖱️", color: "#94a3b8", url: null, volume: 60, muted: false, soloed: false, isClick: true },
      { id: "original", label: "Original", emoji: "📁", color: "#64748b", url: sourceUrl, volume: 70, muted: false, soloed: false, isOriginal: true },
    ];
    setTracks(list);
  }

  // ── Per-stem rerender ─────────────────────────────────────────────────────
  async function handleRerender(stem: GenerateStem) {
    if (rerenderingStem) return;
    setRerenderingStem(stem);
    try {
      const res = await fetch("/api/rerender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId: id, stem, slider: stemSliders[stem] }),
      });
      if (!res.ok) throw new Error("Rerender failed");
      // Start polling again
      setLoading(true);
      setPollingStatus(`Re-composing ${stem}…`);
      setTimeout(fetchGeneration, 3000);
    } catch (e) {
      console.error("Rerender error", e);
    } finally {
      setRerenderingStem(null);
    }
  }

  // ── Generate click track buffer ──────────────────────────────────────────
  function makeClickBuffer(ctx: AudioContext, bpm: number, durationSec: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const totalSamples = Math.ceil(durationSec * sr);
    const buf = ctx.createBuffer(1, totalSamples, sr);
    const data = buf.getChannelData(0);
    const spb = 60 / bpm;
    const beats = Math.ceil(durationSec / spb);
    const clickLen = Math.floor(0.04 * sr);

    for (let b = 0; b < beats; b++) {
      const start = Math.floor(b * spb * sr);
      const isDown = b % 4 === 0;
      const freq = isDown ? 1000 : 800;
      const amp = isDown ? 0.85 : 0.55;
      for (let i = 0; i < clickLen && start + i < totalSamples; i++) {
        const env = Math.exp(-i / (clickLen * 0.3));
        data[start + i] += amp * env * Math.sin(2 * Math.PI * freq * (i / sr));
      }
    }
    return buf;
  }

  // ── Audio analysis ───────────────────────────────────────────────────────
  async function runAnalysis() {
    if (!generation?.sourceUrl) return;
    setAnalysisDoing(true);
    try {
      const ctx = new AudioContext();
      const res = await fetch(`/api/download?url=${encodeURIComponent(generation.sourceUrl)}`);
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);

      const detectedBpm = await detectBPM(audioBuf);
      const detectedKeyStr = detectKey(audioBuf);
      const detectedChords = detectChords(audioBuf, detectedBpm);

      setBpm(detectedBpm);
      setDetectedKey(detectedKeyStr);
      setChords(detectedChords);
      setAnalysisReady(true);

      // Save to DB
      await fetch(`/api/analysis/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bpm: detectedBpm, key: detectedKeyStr, chords: detectedChords }),
      });

      // Pre-build click buffer
      const totalDur = audioBuf.duration;
      clickBufferRef.current = makeClickBuffer(ctx, detectedBpm, totalDur);
      audioBuffers.current.set("click", clickBufferRef.current);
      setDuration(totalDur);

      await ctx.close();
    } catch (e) {
      console.error("Analysis error", e);
    } finally {
      setAnalysisDoing(false);
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  async function loadAudioBuffers(ctx: AudioContext) {
    const toLoad = tracks.filter(t => t.url && !audioBuffers.current.has(t.id));
    await Promise.allSettled(
      toLoad.map(async t => {
        try {
          const res = await fetch(`/api/download?url=${encodeURIComponent(t.url!)}`);
          const arr = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          audioBuffers.current.set(t.id, buf);
          if (!duration) setDuration(buf.duration);
        } catch (e) { console.error("Failed to load", t.id, e); }
      })
    );

    // Build click if not yet
    if (!audioBuffers.current.has("click") && bpm) {
      const d = duration || 120;
      audioBuffers.current.set("click", makeClickBuffer(ctx, bpm, d));
    }
  }

  function getEffectiveGain(track: TrackState): number {
    const anySoloed = tracks.some(t => t.soloed);
    if (anySoloed && !track.soloed) return 0;
    if (track.muted) return 0;
    return track.volume / 100;
  }

  async function handlePlay() {
    if (playing) {
      // Pause
      sourceNodes.current.forEach(s => { try { s.stop(); } catch {} });
      sourceNodes.current.clear();
      offsetRef.current += audioCtxRef.current!.currentTime - startTimeRef.current;
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
      return;
    }

    const ctx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = ctx;

    await loadAudioBuffers(ctx);

    // Stop any existing
    sourceNodes.current.forEach(s => { try { s.stop(); } catch {} });
    sourceNodes.current.clear();
    gainNodes.current.clear();

    const offset = offsetRef.current;
    startTimeRef.current = ctx.currentTime;

    for (const track of tracks) {
      const buf = audioBuffers.current.get(track.id);
      if (!buf) continue;

      const gain = ctx.createGain();
      gain.gain.value = getEffectiveGain(track);
      gain.connect(ctx.destination);
      gainNodes.current.set(track.id, gain);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start(0, Math.min(offset, buf.duration - 0.01));
      sourceNodes.current.set(track.id, src);
    }

    setPlaying(true);
    const tick = () => {
      setCurrentTime(offsetRef.current + (ctx.currentTime - startTimeRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value);
    const wasPlaying = playing;
    if (wasPlaying) {
      sourceNodes.current.forEach(s => { try { s.stop(); } catch {} });
      sourceNodes.current.clear();
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
    }
    offsetRef.current = t;
    setCurrentTime(t);
    if (wasPlaying) setTimeout(handlePlay, 50);
  }

  function updateVolume(id: string, vol: number) {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, volume: vol } : t));
    const gain = gainNodes.current.get(id);
    if (gain) {
      const track = tracks.find(t => t.id === id)!;
      const anySoloed = tracks.some(t => t.soloed);
      const effective = (anySoloed && !track.soloed) || track.muted ? 0 : vol / 100;
      gain.gain.setTargetAtTime(effective, audioCtxRef.current!.currentTime, 0.01);
    }
  }

  function toggleMute(id: string) {
    setTracks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, muted: !t.muted } : t);
      applyGains(next);
      return next;
    });
  }

  function toggleSolo(id: string) {
    setTracks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, soloed: !t.soloed } : t);
      applyGains(next);
      return next;
    });
  }

  function applyGains(nextTracks: TrackState[]) {
    const anySoloed = nextTracks.some(t => t.soloed);
    nextTracks.forEach(t => {
      const gain = gainNodes.current.get(t.id);
      if (gain && audioCtxRef.current) {
        const effective = (anySoloed && !t.soloed) || t.muted ? 0 : t.volume / 100;
        gain.gain.setTargetAtTime(effective, audioCtxRef.current.currentTime, 0.01);
      }
    });
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  // ── Chord chart editing ───────────────────────────────────────────────────
  async function saveChords() {
    await fetch(`/api/analysis/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chords }),
    });
    setEditingChords(false);
  }

  function updateChord(idx: number, val: string) {
    setChords(prev => prev.map((c, i) => i === idx ? { ...c, chord: val } : c));
  }

  function printChordChart() {
    window.print();
  }

  // ── Loading / waiting state ───────────────────────────────────────────────
  if (authStatus === "loading" || loading) {
    const pct = stemProgress && stemProgress.total > 0
      ? Math.round((stemProgress.completed / stemProgress.total) * 100)
      : null;
    const STEM_ICONS: Record<string, string> = {
      drums: "🥁", bass: "🎸", guitar: "🎸", keys: "🎹",
      strings: "🎻", other: "🌊",
    };
    const stemEntries = Object.entries(stemStatuses);
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 px-6">
        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-white text-lg font-semibold mb-1">
            {pct !== null ? `Composing your stems…` : "Loading your mix…"}
          </p>
          {pct !== null && (
            <p className="text-white/40 text-sm">{stemProgress!.completed} of {stemProgress!.total} tracks ready</p>
          )}
        </div>
        {pct !== null && (
          <div className="w-full max-w-md">
            <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden mb-3">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Per-stem status pills */}
            {stemEntries.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {stemEntries.map(([stem, status]) => {
                  const icon = STEM_ICONS[stem.split("-")[0]] ?? "🎵";
                  const label = stem.replace(/-/g, " ");
                  const done = status === "succeeded";
                  const failed = status === "failed";
                  return (
                    <span
                      key={stem}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${
                        done
                          ? "bg-violet-900/60 border-violet-500 text-violet-200"
                          : failed
                          ? "bg-red-900/40 border-red-700 text-red-300"
                          : "bg-white/5 border-white/10 text-white/40 animate-pulse"
                      }`}
                    >
                      <span>{icon}</span>
                      <span className="capitalize">{label}</span>
                      <span>{done ? "✓" : failed ? "✗" : "…"}</span>
                    </span>
                  );
                })}
              </div>
            )}
            <p className="text-center text-xs text-white/20 mt-3">All tracks compose in parallel · typically 1–2 min total</p>
          </div>
        )}
      </div>
    );
  }

  if (!generation) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-red-400">Mix not found.</p>
    </div>
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const currentBar = bpm ? Math.floor(currentTime / ((60 / bpm) * 4)) + 1 : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-16">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/studio")} className="text-gray-400 hover:text-white text-sm">← Studio</button>
          <span className="text-gray-600">|</span>
          <h1 className="text-lg font-bold text-white">Your Mix</h1>
        </div>
        {/* BPM + Key badges */}
        <div className="flex items-center gap-2">
          {bpm && (
            <span className="bg-purple-900/60 border border-purple-700 text-purple-200 text-sm px-3 py-1 rounded-full font-mono">
              ♩ {bpm % 1 === 0 ? bpm : bpm.toFixed(1)} BPM
            </span>
          )}
          {detectedKey && (
            <span className="bg-blue-900/60 border border-blue-700 text-blue-200 text-sm px-3 py-1 rounded-full">
              🎵 {detectedKey}
            </span>
          )}
          {!bpm && !analysisDoing && (
            <button
              onClick={runAnalysis}
              className="bg-purple-800 hover:bg-purple-700 border border-purple-600 text-purple-200 text-sm px-3 py-1.5 rounded-full transition font-medium"
            >
              🔬 Detect BPM + Key
            </button>
          )}
          {analysisDoing && (
            <span className="text-purple-400 text-sm animate-pulse">🔬 Analyzing audio…</span>
          )}
          {bpm && !analysisDoing && (
            <button
              onClick={runAnalysis}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-xs px-2 py-1 rounded-full transition"
              title="Re-run analysis"
            >
              ↺
            </button>
          )}
        </div>
      </div>

      {/* Transport bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <button
          onClick={handlePlay}
          className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition"
        >
          {playing ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <rect x="5" y="4" width="3" height="12"/><rect x="12" y="4" width="3" height="12"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
            </svg>
          )}
        </button>

        <span className="text-gray-400 text-sm font-mono w-10">{formatTime(currentTime)}</span>

        <input
          type="range" min={0} max={duration || 100} step={0.1} value={currentTime}
          onChange={handleSeek}
          className="flex-1 h-1.5 appearance-none bg-gray-700 rounded-full cursor-pointer accent-purple-500"
        />

        <span className="text-gray-500 text-sm font-mono w-10 text-right">{formatTime(duration)}</span>

        {bpm && (
          <span className="text-gray-500 text-xs font-mono">Bar {currentBar}</span>
        )}
      </div>

      {/* Tracks */}
      <div className="px-4 py-4 space-y-2 max-w-5xl mx-auto">
        {tracks.map(track => (
          <div
            key={track.id}
            className={`flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-3 border-l-4 transition ${
              track.muted ? "opacity-50" : ""
            }`}
            style={{ borderLeftColor: track.color }}
          >
            {/* Label */}
            <div className="w-28 flex-shrink-0">
              <span className="text-sm font-medium">{track.emoji} {track.label}</span>
              {!track.url && !track.isClick && (
                <span className="block text-xs text-gray-600">no stem</span>
              )}
            </div>

            {/* Waveform (CSS animation) */}
            <div className="hidden sm:flex items-end gap-0.5 h-6 w-20 flex-shrink-0">
              {Array.from({length: 16}).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm opacity-70"
                  style={{
                    backgroundColor: track.color,
                    height: playing && !track.muted ? `${20 + Math.sin((Date.now() / 200) + i) * 40}%` : "30%",
                    transition: "height 0.15s ease",
                    animation: playing && !track.muted ? `waveBar 0.${(i % 5) + 3}s ease-in-out infinite alternate` : "none",
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>

            {/* Volume slider */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z"/>
              </svg>
              <input
                type="range" min={0} max={100} value={track.volume}
                onChange={e => updateVolume(track.id, Number(e.target.value))}
                className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
                style={{ accentColor: track.color }}
              />
              <span className="text-xs text-gray-500 font-mono w-6 text-right">{track.volume}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => toggleMute(track.id)}
                className={`px-2 py-1 rounded text-xs font-bold transition ${
                  track.muted
                    ? "bg-red-900 text-red-300 border border-red-700"
                    : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
                }`}
              >M</button>
              <button
                onClick={() => toggleSolo(track.id)}
                className={`px-2 py-1 rounded text-xs font-bold transition ${
                  track.soloed
                    ? "bg-yellow-900 text-yellow-300 border border-yellow-700"
                    : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
                }`}
              >S</button>

              {/* Download */}
              {track.url ? (
                <a
                  href={`/api/download?url=${encodeURIComponent(track.url)}&filename=${track.label.toLowerCase()}.mp3`}
                  className="px-2 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition"
                  download
                >↓</a>
              ) : track.isClick && bpm ? (
                <a
                  href={`/api/click?bpm=${bpm}&bars=64`}
                  className="px-2 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition"
                  download={`click-${bpm}bpm.wav`}
                >↓</a>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Per-stem creativity panel (generate mode only) */}
      {generation?.mode === "generate" && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">🎛️ Stem Creativity</h3>
              <span className="text-xs text-gray-500">Adjust a slider then hit ↺ to recompose that stem</span>
            </div>
            <div className="space-y-3">
              {GENERATE_STEMS.map(stem => (
                <div key={stem} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-white/60 shrink-0">{STEM_LABELS[stem]}</span>
                  <input
                    type="range" min={0} max={100} value={stemSliders[stem]}
                    onChange={e => setStemSliders(prev => ({ ...prev, [stem]: Number(e.target.value) }))}
                    className="flex-1 accent-violet-500 h-1.5"
                  />
                  <span className="w-16 text-right text-xs text-violet-300 shrink-0">{sliderLabel(stemSliders[stem])}</span>
                  <button
                    onClick={() => handleRerender(stem)}
                    disabled={rerenderingStem !== null}
                    title={`Re-compose ${stem}`}
                    className="px-2 py-1 rounded text-xs bg-violet-900/50 hover:bg-violet-800 border border-violet-700 text-violet-300 transition disabled:opacity-40 shrink-0"
                  >
                    {rerenderingStem === stem ? "…" : "↺"}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-white/20 mt-2 px-[6.5rem]">
              <span>← Mirror structure</span>
              <span>Original →</span>
            </div>
          </div>
        </div>
      )}

      {/* Chord Chart Section — always shown when generation is complete */}
      {generation?.status === "completed" && (
        <div className="max-w-5xl mx-auto px-4 mt-8">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">🎼 Chord Chart</h2>
                {detectedKey && (
                  <p className="text-sm text-gray-400 mt-0.5">Key: {detectedKey}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingChords(!editingChords)}
                  className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition"
                >
                  {editingChords ? "Cancel" : "✏️ Edit"}
                </button>
                {editingChords && (
                  <button
                    onClick={saveChords}
                    className="text-sm px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 border border-purple-600 transition"
                  >
                    Save
                  </button>
                )}
                <button
                  onClick={printChordChart}
                  className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition"
                >
                  🖨️ Print
                </button>
              </div>
            </div>

            {/* Chart grid — 4 chords per row (bars) */}
            <div className="grid grid-cols-4 gap-2">
              {chords.map((c, idx) => {
                // Highlight current bar
                const isCurrent = bpm && playing && currentBar === c.bar + 1;
                return (
                  <div
                    key={idx}
                    className={`rounded-lg border p-3 transition ${
                      isCurrent
                        ? "border-purple-500 bg-purple-900/40"
                        : "border-gray-700 bg-gray-800/60"
                    }`}
                  >
                    <div className="text-xs text-gray-500 mb-1">Bar {c.bar + 1}</div>
                    {editingChords ? (
                      <input
                        value={c.chord}
                        onChange={e => updateChord(idx, e.target.value)}
                        className="w-full bg-transparent text-white text-xl font-bold font-mono outline-none border-b border-purple-500"
                      />
                    ) : (
                      <div className="text-xl font-bold font-mono text-white">{c.chord}</div>
                    )}
                    <div className="text-xs text-gray-600 mt-1">{c.duration} beat{c.duration !== 1 ? "s" : ""}</div>
                  </div>
                );
              })}
            </div>

            {chords.length === 0 && !analysisDoing && (
              <div className="text-center text-gray-500 py-8">
                <p>Run "Detect BPM + Key" above to generate chord detection.</p>
              </div>
            )}
            {analysisDoing && (
              <div className="text-center text-purple-400 py-8 animate-pulse">
                Analyzing chords…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Download All */}
      <div className="max-w-5xl mx-auto px-4 mt-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-400 mr-2">Download:</span>
          {tracks.filter(t => t.url || t.isClick).map(t => (
            t.url ? (
              <a
                key={t.id}
                href={`/api/download?url=${encodeURIComponent(t.url)}&filename=${t.label.toLowerCase()}.mp3`}
                download
                className="text-xs px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white transition"
              >
                {t.emoji} {t.label}
              </a>
            ) : t.isClick && bpm ? (
              <a
                key={t.id}
                href={`/api/click?bpm=${bpm}&bars=64`}
                download={`click-${bpm}bpm.wav`}
                className="text-xs px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white transition"
              >
                🖱️ Click Track
              </a>
            ) : null
          ))}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @keyframes waveBar {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .grid { display: grid; }
        }
      `}</style>
    </div>
  );
}
