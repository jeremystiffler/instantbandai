"use client";
import { useSession } from "next-auth/react";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EXTRA_INSTRUMENT_OPTIONS, VARIANT_LABELS } from "@/lib/musicgen";
import { AuthBox } from "@/components/auth-box";
// Pre-import music-tempo so it's ready when the user drops a file
import MusicTempo from "music-tempo";

const GENERATE_STEMS = ["drums", "bass", "guitar", "keys", "strings", "other"] as const;
type GenerateStem = (typeof GENERATE_STEMS)[number];

const STEM_LABELS: Record<GenerateStem, string> = {
  drums: "🥁 Drums",
  bass: "🎸 Bass",
  guitar: "🎸 Guitar",
  keys: "🎹 Keys",
  strings: "🎻 Strings",
  other: "✨ Other",
};

const DEFAULT_SLIDERS: Record<GenerateStem, number> = {
  drums: 0, bass: 0, guitar: 0, keys: 0, strings: 0, other: 0,
};

type MelodyNote = {
  id: string;
  midi: number;
  note: string;
  start: number;
  duration: number;
  end: number;
  velocity: number;
  enabled: boolean;
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(midi: number) {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${octave}`;
}

function snapMidiToA440Semitone(midi: number) {
  // Basic Pitch can return slightly sharp/flat fractional MIDI values.
  // Snap to 12-TET semitones where MIDI 69 = A4 = 440 Hz, so every
  // generated/downloaded MIDI note is centered within a half-step grid.
  return Math.max(0, Math.min(127, Math.round(midi)));
}

function clampVelocity(v: number) {
  return Math.max(1, Math.min(127, Math.round(v)));
}

function tempoQuantizeMelodyNotes(
  rawNotes: Array<Omit<MelodyNote, "id" | "note" | "enabled">>,
  bpm: number,
  sourceDuration: number,
) {
  const beatSeconds = 60 / Math.max(40, Math.min(240, bpm || 120));
  // Use a 16th-note grid as the first musical "pixel," then prune anything
  // too quiet/short to be a useful musical event. This keeps fast real notes,
  // but cuts the sparkle-dust artifacts that Basic Pitch can hallucinate.
  const gridSeconds = beatSeconds / 4;
  const mergeGapSeconds = gridSeconds;
  const velocities = rawNotes.map((n) => n.velocity).sort((a, b) => a - b);
  const dynamicVelocityFloor = velocities.length
    ? velocities[Math.floor(velocities.length * 0.38)]
    : 0;
  const velocityFloor = Math.max(0.15, dynamicVelocityFloor * 0.9);

  const quantized = rawNotes
    .filter((n) => n.velocity >= velocityFloor)
    .map((n) => {
      const start = Math.max(0, Math.round(n.start / gridSeconds) * gridSeconds);
      const rawEnd = Math.max(n.end, n.start + gridSeconds);
      const end = Math.min(
        sourceDuration,
        Math.max(start + gridSeconds, Math.round(rawEnd / gridSeconds) * gridSeconds)
      );
      return { ...n, start, end, duration: end - start };
    })
    .filter((n) => n.duration >= gridSeconds)
    .sort((a, b) => a.start - b.start || a.midi - b.midi);

  const merged: Array<Omit<MelodyNote, "id" | "note" | "enabled">> = [];
  for (const note of quantized) {
    const lastSamePitch = merged.findLast((candidate) => candidate.midi === note.midi);
    if (lastSamePitch && note.start <= lastSamePitch.end + mergeGapSeconds) {
      lastSamePitch.end = Math.max(lastSamePitch.end, note.end);
      lastSamePitch.duration = lastSamePitch.end - lastSamePitch.start;
      lastSamePitch.velocity = Math.max(lastSamePitch.velocity, note.velocity);
    } else {
      merged.push({ ...note });
    }
  }

  const byStartBucket = new Map<number, Array<Omit<MelodyNote, "id" | "note" | "enabled">>>();
  for (const note of merged) {
    const bucket = Math.round(note.start / gridSeconds);
    byStartBucket.set(bucket, [...(byStartBucket.get(bucket) ?? []), note]);
  }

  const cleaned = Array.from(byStartBucket.values()).flatMap((bucketNotes) =>
    bucketNotes
      .sort((a, b) => b.velocity - a.velocity || b.duration - a.duration)
      // Keep chord support, but cap impossible/junky note clusters.
      .slice(0, 4)
      // One-grid blips must be confident; otherwise they're probably artifacts.
      .filter((n) => n.duration > gridSeconds || n.velocity >= velocityFloor * 1.5)
  );

  return cleaned
    .sort((a, b) => a.start - b.start || a.midi - b.midi)
    .slice(0, 120)
    .map((n, index) => ({
      id: `${index}-${Math.round(n.start * 1000)}-${n.midi}`,
      midi: n.midi,
      note: midiToNoteName(n.midi),
      start: n.start,
      duration: n.duration,
      end: n.end,
      velocity: n.velocity,
      enabled: true,
    }));
}

function writeVarLen(value: number) {
  const bytes = [value & 0x7f];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function writeTextMeta(type: number, text: string) {
  const encoded = Array.from(new TextEncoder().encode(text));
  return [0x00, 0xff, type, ...writeVarLen(encoded.length), ...encoded];
}

function makeMidiFile(notes: MelodyNote[], bpm: number | null, fileDuration: number) {
  const ppq = 480;
  const tempo = Math.max(40, Math.min(240, bpm ?? 120));
  const microsPerQuarter = Math.round(60_000_000 / tempo);
  const secondsToTicks = (seconds: number) => Math.max(0, Math.round(seconds * (tempo / 60) * ppq));

  const events = notes
    .filter((n) => n.enabled)
    .flatMap((n) => {
      const start = secondsToTicks(n.start);
      const end = Math.max(start + 1, secondsToTicks(n.end));
      const pitch = Math.max(0, Math.min(127, Math.round(n.midi)));
      const velocity = clampVelocity(n.velocity * 127 || 88);
      return [
        { tick: start, order: 1, data: [0x90, pitch, velocity] },
        { tick: end, order: 0, data: [0x80, pitch, 0] },
      ];
    })
    .sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [
    ...writeTextMeta(0x03, "InstantBandAI Upload Melody"),
    0x00, 0xff, 0x51, 0x03,
    (microsPerQuarter >> 16) & 0xff,
    (microsPerQuarter >> 8) & 0xff,
    microsPerQuarter & 0xff,
    0x00, 0xc0, 0x00,
  ];

  let lastTick = 0;
  for (const event of events) {
    track.push(...writeVarLen(event.tick - lastTick), ...event.data);
    lastTick = event.tick;
  }

  const finalTick = Math.max(lastTick, secondsToTicks(fileDuration));
  track.push(...writeVarLen(finalTick - lastTick), 0xff, 0x2f, 0x00);

  const header = [0x4d,0x54,0x68,0x64, 0x00,0x00,0x00,0x06, 0x00,0x00, 0x00,0x01, (ppq >> 8) & 0xff, ppq & 0xff];
  const trackHeader = [0x4d,0x54,0x72,0x6b, (track.length >> 24) & 0xff, (track.length >> 16) & 0xff, (track.length >> 8) & 0xff, track.length & 0xff];
  return new Blob([new Uint8Array([...header, ...trackHeader, ...track])], { type: "audio/midi" });
}

export default function StudioPage() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mode, setMode] = useState<"separate" | "melody" | "style" | "loops">("melody");
  const [stylePrompt, setStylePrompt] = useState("radio-ready full-band arrangement, preserve the original melody and phrasing, tasteful drums, bass, piano, guitars, warm pads, natural dynamics, high-quality studio production");
  const [sliders, setSliders] = useState<Record<GenerateStem, number>>({ ...DEFAULT_SLIDERS });
  const [extraStems, setExtraStems] = useState<string[]>([]);
  const [variantPickerOpen, setVariantPickerOpen] = useState<string | null>(null);
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [manualKey, setManualKey] = useState<string>("");  // user-selected key, "" = none
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [sourceDuration, setSourceDuration] = useState<number | null>(null);
  const [melodyNotes, setMelodyNotes] = useState<MelodyNote[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewTime(0);
    setPreviewPlaying(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Audio analysis: duration + BPM + polyphonic MIDI note extraction ─────
  const analyzeFile = useCallback(async (f: File) => {
    if (mode !== "melody" && mode !== "loops" && mode !== "style") return;
    setAnalyzing(true);
    setAnalysisProgress(0);
    setDetectedBpm(null);
    setMelodyNotes([]);
    setSourceDuration(null);
    try {
      const ctx = new AudioContext();
      const arrayBuf = await f.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      setSourceDuration(audioBuf.duration);
      // Mix down to mono
      const data = audioBuf.getChannelData(0);
      // music-tempo: ACF-based beat tracker, very fast
      const mt = new MusicTempo(data, { sampleRate: audioBuf.sampleRate });
      let bpm = mt.tempo;
      // Octave-correct into 60–180 range
      while (bpm > 180) bpm /= 2;
      while (bpm < 60) bpm *= 2;
      setDetectedBpm(Math.round(bpm));

      if (mode === "melody") {
        const { BasicPitch, outputToNotesPoly, addPitchBendsToNoteEvents, noteFramesToTime } = await import("@spotify/basic-pitch");
        const frames: number[][] = [];
        const onsets: number[][] = [];
        const contours: number[][] = [];
        const modelUrl = `${window.location.origin}/basic-pitch/model.json`;
        const offline = new OfflineAudioContext(1, Math.ceil(audioBuf.duration * 22050), 22050);
        const source = offline.createBufferSource();
        source.buffer = audioBuf;
        source.connect(offline.destination);
        source.start(0);
        const mono22kBuffer = await offline.startRendering();
        const basicPitch = new BasicPitch(modelUrl);
        await basicPitch.evaluateModel(
          mono22kBuffer,
          (f: number[][], o: number[][], c: number[][]) => {
            frames.push(...f);
            onsets.push(...o);
            contours.push(...c);
          },
          (p: number) => setAnalysisProgress(Math.round(p * 100))
        );

        const rawNotes = noteFramesToTime(
          addPitchBendsToNoteEvents(
            contours,
            outputToNotesPoly(frames, onsets, 0.38, 0.34, 8)
          )
        )
          .filter((n) => n.durationSeconds >= 0.03)
          .slice(0, 260)
          .map((n) => {
            const tunedMidi = snapMidiToA440Semitone(n.pitchMidi);
            return {
              midi: tunedMidi,
              start: n.startTimeSeconds,
              duration: n.durationSeconds,
              end: n.startTimeSeconds + n.durationSeconds,
              velocity: n.amplitude,
            };
          });
        setMelodyNotes(tempoQuantizeMelodyNotes(rawNotes, Math.round(bpm), audioBuf.duration));
      }
      await ctx.close();
    } catch (e) {
      console.error("Audio analysis error", e);
      setError("Could not analyze that audio file. You can still generate from it, but the MIDI note editor will be unavailable.");
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(0);
    }
  }, [mode]);

  // --- Drag & Drop ---
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith("audio/")) {
      setFile(dropped);
      setError("");
      analyzeFile(dropped);
    }
    else setError("Please drop an audio file (MP3, WAV, M4A).");
  }, [analyzeFile]);

  // --- Recording ---
  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("webm") ? "webm" : "ogg";
        const recordedFile = new File([blob], `recording.${ext}`, { type: mimeType });
        setFile(recordedFile);
        analyzeFile(recordedFile);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { setError("Microphone access denied."); }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

function sliderLabel(val: number) {
  if (val <= 15) return "Original";
  if (val <= 40) return "Close";
  if (val <= 65) return "Blend";
  if (val <= 85) return "Inspired";
  return "Creative";
}

  async function handleGenerate() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      setLoadingMsg("Uploading audio…");
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: uploadForm });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${uploadRes.status})`);
      }
      const { publicUrl, key } = await uploadRes.json();

      setLoadingMsg(mode === "melody" ? "Orchestrating your melody…" : mode === "style" ? "Composing full track with AI…" : mode === "loops" ? "Generating instrument loops…" : "Starting stem separation…");
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          sourceUrl: publicUrl,
          mode,
          sliders: mode === "loops" ? sliders : undefined,
          extraStems: mode === "loops" ? extraStems : undefined,
          stylePrompt: (mode === "style" || mode === "melody") ? stylePrompt : undefined,
          bpm: detectedBpm ?? undefined,
          musicKey: manualKey || undefined,
          duration: sourceDuration ?? undefined,
          melodyNotes: mode === "melody" ? melodyNotes.filter((n) => n.enabled).map((n) => ({
            note: n.note,
            midi: Math.round(n.midi),
            start: Number(n.start.toFixed(3)),
            duration: Number(n.duration.toFixed(3)),
          })) : undefined,
        }),
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error(err.error || `Generate failed (${genRes.status})`);
      }
      const { id } = await genRes.json();
      router.push(`/mix/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
      setLoadingMsg("");
    }
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const fmtSeconds = (s: number) => `${s.toFixed(2)}s`;
  const enabledNotes = melodyNotes.filter((n) => n.enabled);
  const melodyPitchRange = enabledNotes.length
    ? `${midiToNoteName(Math.min(...enabledNotes.map((n) => n.midi)))}–${midiToNoteName(Math.max(...enabledNotes.map((n) => n.midi)))}`
    : "—";
  const previewDuration = sourceDuration ?? previewAudioRef.current?.duration ?? 0;
  const playheadPercent = previewDuration > 0 ? Math.max(0, Math.min(100, (previewTime / previewDuration) * 100)) : 0;
  const activeNoteIds = new Set(
    melodyNotes
      .filter((n) => n.enabled && previewTime >= n.start && previewTime <= n.end)
      .map((n) => n.id)
  );

  function syncPreviewMetadata() {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setSourceDuration((current) => current ?? audio.duration);
    }
    setPreviewTime(audio.currentTime || 0);
  }

  function seekPreviewFromTimeline(e: React.MouseEvent<HTMLDivElement>) {
    const audio = previewAudioRef.current;
    if (!audio || !previewDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * previewDuration;
    setPreviewTime(audio.currentTime);
  }

  function toggleMelodyNote(id: string) {
    setMelodyNotes((prev) => prev.map((n) => n.id === id ? { ...n, enabled: !n.enabled } : n));
  }

  function removeMelodyNote(id: string) {
    setMelodyNotes((prev) => prev.filter((n) => n.id !== id));
  }

  function downloadMidi() {
    if (!melodyNotes.length) return;
    const blob = makeMidiFile(melodyNotes, detectedBpm, sourceDuration ?? Math.max(...melodyNotes.map((n) => n.end)));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name.replace(/\.[^/.]+$/, "") || "instantbandai-melody"}.mid`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (status === "loading") return (
    <div className="flex items-center justify-center min-h-[60vh] text-white/50">Loading...</div>
  );
  if (!session) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="text-center space-y-2">
        <p className="text-white/80 text-xl font-semibold">Sign in to use the studio</p>
        <p className="text-white/45 text-sm">Use Google, or create a regular email/password account.</p>
      </div>
      <AuthBox />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Studio</h1>

      {/* Mode Toggle */}
      <div className="flex gap-1 mb-6 p-1 bg-white/5 rounded-xl border border-white/10 flex-wrap">
        <button
          onClick={() => setMode("melody")}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition whitespace-nowrap ${
            mode === "melody"
              ? "bg-violet-600 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          🎼 Producer Arrangement
        </button>
        <button
          onClick={() => setMode("style")}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition whitespace-nowrap ${
            mode === "style"
              ? "bg-emerald-600 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          ✨ Style Compose
        </button>
        <button
          onClick={() => setMode("loops")}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition whitespace-nowrap ${
            mode === "loops"
              ? "bg-amber-600 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          🎛️ Instrument Loops
        </button>
        <button
          onClick={() => setMode("separate")}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition whitespace-nowrap ${
            mode === "separate"
              ? "bg-blue-600 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          ✂️ Separate
        </button>
      </div>

      {mode === "melody" && (
        <div className="mb-6 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 space-y-3">
          <p className="text-white/50 text-xs">
            Best quality path: upload a vocal, piano, guitar, or rough demo — AI creates a fuller band arrangement while trying to preserve the original musical idea. Describe the desired production below.
          </p>
          <input
            type="text"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="e.g. Nashville country band, acoustic worship ballad, indie rock, piano-led pop..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50"
          />
        </div>
      )}
      {mode === "style" && (
        <div className="mb-6 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
          <p className="text-white/50 text-xs">
            AI composes an original full stereo backing track from scratch. Not melody-locked — more creative freedom. Describe the style below.
          </p>
          <input
            type="text"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="e.g. cinematic, worship, acoustic guitar, piano, strings, 90 BPM..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      )}
      {mode === "loops" && (
        <div className="mb-6 p-1.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <p className="text-white/50 text-xs px-3 pt-2 pb-3">
            Experimental mode: generates short instrument loops matched to your BPM/key. Useful for ideas, but not the flagship quality path.
          </p>
        </div>
      )}
      {mode === "separate" && (
        <div className="mb-6 p-1.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
          <p className="text-white/50 text-xs px-3 pt-2 pb-3">
            Utility mode: separates existing instruments from an uploaded recording. Helpful for analysis and remixing, not for creating a new band arrangement.
          </p>
        </div>
      )}


      {/* Drop Zone */}
      <div
        onClick={() => !recording && !file && inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition mb-4 ${
          dragging ? "border-violet-400 bg-violet-500/10" :
          file ? "border-violet-500 bg-violet-500/5" :
          "border-white/20 hover:border-violet-500"
        }`}
      >
        {file ? (
          <div>
            <p className="text-violet-400 font-medium text-lg">✓ {file.name}</p>
            <p className="text-white/40 text-sm mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            {previewUrl && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3" onClick={(e) => e.stopPropagation()}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Preview recording</span>
                  <span className="text-xs text-white/30">Listen before generating</span>
                </div>
                <audio
                  ref={previewAudioRef}
                  controls
                  src={previewUrl}
                  className="w-full"
                  preload="metadata"
                  onLoadedMetadata={syncPreviewMetadata}
                  onDurationChange={syncPreviewMetadata}
                  onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime || 0)}
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={() => setPreviewPlaying(false)}
                  onEnded={(e) => { setPreviewPlaying(false); setPreviewTime(e.currentTarget.duration || 0); }}
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}
            {/* BPM + Key controls */}
            {(mode === "melody" || mode === "style" || mode === "loops") && (
              <div className="flex flex-col items-center gap-3 mt-3">
                {/* BPM row — manual entry with optional auto-detect */}
                <div className="flex items-center justify-center gap-2">
                  <label className="text-white/40 text-xs font-medium">BPM:</label>
                  <input
                    type="number"
                    min={40} max={250}
                    value={detectedBpm ?? ""}
                    onChange={e => { e.stopPropagation(); const v = parseInt(e.target.value); setDetectedBpm(isNaN(v) ? null : v); }}
                    onClick={e => e.stopPropagation()}
                    placeholder="e.g. 120"
                    className="w-20 bg-zinc-900 border border-white/10 rounded-lg text-white/80 text-xs px-2.5 py-1.5 text-center focus:outline-none focus:border-violet-500/60"
                  />
                  <span className="text-white/30 text-xs">BPM</span>
                  <button
                    onClick={e => { e.stopPropagation(); if (file) analyzeFile(file); }}
                    disabled={analyzing}
                    className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 border border-white/10 text-white/50 hover:text-white/80 hover:border-violet-500/40 disabled:opacity-40 transition"
                  >
                    {analyzing ? "🎵 Detecting…" : "Auto-detect"}
                  </button>
                </div>
                {/* Key selector */}
                <div className="flex items-center gap-2">
                  <label className="text-white/40 text-xs font-medium">Key (optional):</label>
                  <select
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-zinc-900 border border-white/10 rounded-lg text-white/80 text-xs px-2.5 py-1.5 focus:outline-none focus:border-violet-500/60 cursor-pointer [&>option]:bg-zinc-900 [&>option]:text-white"
                  >
                    <option value="">— unknown —</option>
                    {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].flatMap(note => [
                      <option key={`${note}-major`} value={`${note} major`}>{note} major</option>,
                      <option key={`${note}-minor`} value={`${note} minor`}>{note} minor</option>,
                    ])}
                  </select>
                </div>
              </div>
            )}
            {mode === "melody" && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3 text-left" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/80">MIDI melody map</p>
                    <p className="text-xs text-white/35 mt-1">
                      {analyzing
                        ? `Listening for notes${analysisProgress ? `… ${analysisProgress}%` : "…"}`
                        : melodyNotes.length
                        ? `${enabledNotes.length}/${melodyNotes.length} notes active · A440 snapped · tempo-quantized · artifact-filtered · range ${melodyPitchRange} · source ${sourceDuration ? fmtSeconds(sourceDuration) : "—"}`
                        : "Upload or record audio to detect A440-snapped, tempo-quantized notes. Click notes to mute; ✕ deletes wrong notes."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMelodyNotes((prev) => prev.map((n) => ({ ...n, enabled: true })))}
                      disabled={!melodyNotes.length}
                      className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/50 hover:text-white/80 disabled:opacity-30"
                    >
                      Restore all
                    </button>
                    <button
                      type="button"
                      onClick={downloadMidi}
                      disabled={!enabledNotes.length}
                      className="px-2.5 py-1 rounded-lg bg-violet-600/80 border border-violet-400/30 text-xs text-white hover:bg-violet-500 disabled:opacity-30"
                    >
                      Download MIDI
                    </button>
                  </div>
                </div>

                {melodyNotes.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between px-1 text-[11px] font-mono text-white/35">
                      <span>{previewPlaying ? "▶" : "Ⅱ"} {fmtSeconds(previewTime)}</span>
                      <span>{previewDuration ? fmtSeconds(previewDuration) : "—"}</span>
                    </div>
                    <div
                      className="relative h-14 rounded-lg bg-zinc-950/80 border border-white/5 overflow-hidden cursor-crosshair"
                      onClick={seekPreviewFromTimeline}
                      title="Click to seek the original audio preview"
                    >
                      {melodyNotes.map((note) => {
                        const left = previewDuration ? Math.max(0, Math.min(100, (note.start / previewDuration) * 100)) : 0;
                        const width = previewDuration ? Math.max(1.5, Math.min(100 - left, (note.duration / previewDuration) * 100)) : 2;
                        const top = 8 + (1 - ((note.midi - Math.min(...melodyNotes.map((n) => n.midi))) / Math.max(1, Math.max(...melodyNotes.map((n) => n.midi)) - Math.min(...melodyNotes.map((n) => n.midi))))) * 32;
                        const isActive = activeNoteIds.has(note.id);
                        return (
                          <button
                            key={note.id}
                            type="button"
                            title={`${note.note} @ ${fmtSeconds(note.start)}`}
                            onClick={(e) => { e.stopPropagation(); toggleMelodyNote(note.id); }}
                            className={`absolute rounded-sm border transition ${
                              isActive
                                ? "bg-emerald-300 border-white shadow-[0_0_12px_rgba(110,231,183,0.85)]"
                                : note.enabled
                                ? "bg-violet-400/80 border-violet-200/60"
                                : "bg-white/10 border-white/15 opacity-40"
                            }`}
                            style={{ left: `${left}%`, width: `${width}%`, top: `${top}px`, height: "10px" }}
                          />
                        );
                      })}
                      <div
                        className="pointer-events-none absolute inset-y-0 z-20 w-px bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.95)]"
                        style={{ left: `${playheadPercent}%` }}
                      >
                        <div className="absolute -left-1 -top-0.5 h-2 w-2 rounded-full bg-emerald-200" />
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-xs text-white/35 px-1">
                      <span>Note</span><span>Start</span><span>Length</span><span />
                    </div>
                    {melodyNotes.map((note) => {
                      const isActive = activeNoteIds.has(note.id);
                      return (
                      <div key={note.id} className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg border px-2 py-1.5 ${isActive ? "bg-emerald-400/15 border-emerald-300/50" : note.enabled ? "bg-white/5 border-white/10" : "bg-white/[0.02] border-white/5 opacity-55"}`}>
                        <button type="button" onClick={() => toggleMelodyNote(note.id)} className={`text-left font-mono text-sm hover:text-violet-200 ${isActive ? "text-emerald-200" : "text-white/80"}`}>
                          {isActive ? "▶" : note.enabled ? "■" : "□"} {note.note}
                        </button>
                        <span className="font-mono text-white/45">{fmtSeconds(note.start)}</span>
                        <span className="font-mono text-white/45">{fmtSeconds(note.duration)}</span>
                        <button type="button" onClick={() => removeMelodyNote(note.id)} className="text-white/30 hover:text-red-300 px-1">✕</button>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            )}
            <button onClick={e => { e.stopPropagation(); setFile(null); setDetectedBpm(null); setManualKey(""); setMelodyNotes([]); setSourceDuration(null); }} className="mt-3 text-xs text-white/30 hover:text-white/60 underline">
              Remove
            </button>
          </div>
        ) : dragging ? (
          <p className="text-violet-400 font-medium">Drop it! 🎵</p>
        ) : (
          <>
            <p className="text-white/60 mb-2">Drop your audio file here or click to browse</p>
            <p className="text-white/30 text-sm">MP3, WAV, M4A up to 256MB</p>
          </>
        )}
        <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); setError(""); if (f) analyzeFile(f); }} />
      </div>

      {/* Record Button */}
      <div className="flex items-center gap-3 mb-6">
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm transition disabled:opacity-40"
          >
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            Record from mic
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition animate-pulse"
          >
            <span className="w-3 h-3 rounded-full bg-white inline-block" />
            Stop — {fmtTime(recordingTime)}
          </button>
        )}
      </div>

      {/* Per-stem sliders (loops mode only) */}
      {mode === "loops" && (
        <div className="mb-8 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Stem Creativity</h3>
            <button
              onClick={() => setSliders({ ...DEFAULT_SLIDERS })}
              className="text-xs text-white/30 hover:text-white/60 transition"
            >
              Reset all
            </button>
          </div>
          {GENERATE_STEMS.map((stem) => (
            <div key={stem} className="flex items-center gap-3">
              <span className="w-28 text-sm text-white/60 shrink-0">{STEM_LABELS[stem]}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={sliders[stem]}
                onChange={e => setSliders(prev => ({ ...prev, [stem]: Number(e.target.value) }))}
                className="flex-1 accent-violet-500 h-1.5"
              />
              <span className="w-16 text-right text-xs text-violet-300 shrink-0">
                {sliderLabel(sliders[stem])}
              </span>
            </div>
          ))}
          <div className="flex justify-between text-xs text-white/20 mt-1 px-[7.5rem]">
            <span>← Stays true to source</span>
            <span>Fully original →</span>
          </div>

          {/* ── Add Instruments ────────────────────────────────── */}
          <div className="mt-6 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
                Add Instruments
              </h3>
              <span className="text-xs text-white/30">
                {extraStems.length}/4 slots
              </span>
            </div>

            {/* Category buttons — click expands variant picker */}
            <div className="flex flex-wrap gap-2 mb-3">
              {EXTRA_INSTRUMENT_OPTIONS.map((inst) => {
                const addedVariants = extraStems.filter(s => s.startsWith(inst.id + "-"));
                const allVariantsUsed = addedVariants.length >= inst.variants.length;
                const atSlotLimit = extraStems.length >= 4;
                const isOpen = variantPickerOpen === inst.id;
                return (
                  <div key={inst.id} className="relative">
                    <button
                      disabled={allVariantsUsed || (atSlotLimit && addedVariants.length === 0)}
                      onClick={() => setVariantPickerOpen(isOpen ? null : inst.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                        allVariantsUsed
                          ? "bg-violet-900/30 border-violet-500/40 text-violet-300 cursor-not-allowed"
                          : (atSlotLimit && addedVariants.length === 0)
                          ? "bg-white/5 border-white/10 text-white/20 cursor-not-allowed"
                          : isOpen
                          ? "bg-violet-600 border-violet-400 text-white"
                          : addedVariants.length > 0
                          ? "bg-violet-600/30 border-violet-500 text-violet-200 hover:bg-violet-600/50"
                          : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {inst.label}
                      {addedVariants.length > 0 && !allVariantsUsed && <span className="ml-1 opacity-60">▾</span>}
                      {allVariantsUsed && <span className="ml-1 opacity-50">✓</span>}
                      {!allVariantsUsed && addedVariants.length === 0 && <span className="ml-1 opacity-40">▾</span>}
                    </button>
                    {/* Variant dropdown */}
                    {isOpen && (
                      <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-white/15 rounded-xl shadow-xl overflow-hidden min-w-[220px]">
                        <div className="px-3 py-2 border-b border-white/10">
                          <span className="text-xs text-white/40 uppercase tracking-wider">Choose style</span>
                        </div>
                        {inst.variants.map((v) => {
                          const variantId = `${inst.id}-${v.suffix}`;
                          const alreadyAdded = extraStems.includes(variantId);
                          const wouldExceedSlots = extraStems.length >= 4 && !alreadyAdded;
                          return (
                            <button
                              key={v.suffix}
                              disabled={alreadyAdded || wouldExceedSlots}
                              onClick={() => {
                                if (alreadyAdded || wouldExceedSlots) return;
                                setExtraStems(prev => [...prev, variantId]);
                                setVariantPickerOpen(null);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center justify-between ${
                                alreadyAdded
                                  ? "text-violet-400 bg-violet-900/30 cursor-default"
                                  : wouldExceedSlots
                                  ? "text-white/20 cursor-not-allowed"
                                  : "text-white/80 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              <span>{v.label.split("(")[1]?.replace(")", "") ?? v.label}</span>
                              {alreadyAdded && <span className="text-xs text-violet-400 ml-2">Added ✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Added variant chips — each removable */}
            {extraStems.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {extraStems.map((variantId) => {
                  const label = VARIANT_LABELS[variantId] ?? variantId;
                  return (
                    <div key={variantId} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                      <span className="text-sm text-white/80">{label}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExtraStems(prev => prev.filter(s => s !== variantId))}
                          className="text-white/30 hover:text-white/70 text-xs transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-violet-400 mt-1">
                  +{extraStems.length} track{extraStems.length > 1 ? "s" : ""} · ~{extraStems.length * 30}s extra render time

                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={!file || loading}
        className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition"
      >
        {loading ? loadingMsg || "Working…" : mode === "melody" ? "Create Producer Arrangement →" : mode === "style" ? "Compose Style →" : mode === "loops" ? "Generate Loops →" : "Separate Stems →"}
      </button>
    </div>
  );
}
