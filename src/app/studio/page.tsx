"use client";
import { useSession, signIn } from "next-auth/react";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { genUploader } from "uploadthing/client";
import { EXTRA_INSTRUMENT_OPTIONS, VARIANT_LABELS } from "@/lib/musicgen";
// Pre-import music-tempo so it's ready when the user drops a file
import MusicTempo from "music-tempo";

const { uploadFiles } = genUploader({ url: "/api/uploadthing" });

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

export default function StudioPage() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mode, setMode] = useState<"separate" | "generate">("generate");
  const [sliders, setSliders] = useState<Record<GenerateStem, number>>({ ...DEFAULT_SLIDERS });
  const [extraStems, setExtraStems] = useState<string[]>([]);
  const [variantPickerOpen, setVariantPickerOpen] = useState<string | null>(null);
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [manualKey, setManualKey] = useState<string>("");  // user-selected key, "" = none
  const [analyzing, setAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  // ── BPM detection via music-tempo (ACF beat tracker, ~200ms) ──────────────
  const analyzeFile = useCallback(async (f: File) => {
    if (mode !== "generate") return;
    setAnalyzing(true);
    setDetectedBpm(null);
    try {
      const ctx = new AudioContext();
      const arrayBuf = await f.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      // Mix down to mono
      const data = audioBuf.getChannelData(0);
      // music-tempo: ACF-based beat tracker, very fast
      const mt = new MusicTempo(data, { sampleRate: audioBuf.sampleRate });
      let bpm = mt.tempo;
      // Octave-correct into 60–180 range
      while (bpm > 180) bpm /= 2;
      while (bpm < 60) bpm *= 2;
      setDetectedBpm(Math.round(bpm));
      await ctx.close();
    } catch (e) {
      console.error("BPM detection error", e);
    } finally {
      setAnalyzing(false);
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
        setFile(new File([blob], `recording.${ext}`, { type: mimeType }));
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
      const [res] = await uploadFiles("audioUploader", { files: [file] });
      const publicUrl = res.url;
      const key = res.key;

      setLoadingMsg(mode === "generate" ? "Composing stems with AI…" : "Starting stem separation…");
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          sourceUrl: publicUrl,
          mode,
          sliders: mode === "generate" ? sliders : undefined,
          extraStems: mode === "generate" ? extraStems : undefined,
          prompt,
          bpm: detectedBpm ?? undefined,
          musicKey: manualKey || undefined,
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

  if (status === "loading") return (
    <div className="flex items-center justify-center min-h-[60vh] text-white/50">Loading...</div>
  );
  if (!session) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-white/60">Sign in to use the studio</p>
      <button onClick={() => signIn("google")} className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-lg font-medium transition">
        Sign in with Google
      </button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Studio</h1>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-8 p-1 bg-white/5 rounded-xl border border-white/10">
        <button
          onClick={() => setMode("generate")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition ${
            mode === "generate"
              ? "bg-violet-600 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          🎵 AI Compose
        </button>
        <button
          onClick={() => setMode("separate")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition ${
            mode === "separate"
              ? "bg-violet-600 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          ✂️ Track Separation
        </button>
      </div>

      {mode === "generate" && (
        <div className="mb-6 p-1.5 rounded-xl bg-violet-500/5 border border-violet-500/20">
          <p className="text-white/50 text-xs px-3 pt-2 pb-3">
            AI composes original instrument tracks that complement your audio.
            Slide toward <strong className="text-white/70">Original</strong> for more creative freedom.
          </p>
        </div>
      )}
      {mode === "separate" && (
        <div className="mb-6 p-1.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
          <p className="text-white/50 text-xs px-3 pt-2 pb-3">
            Isolates the existing instruments from your uploaded track (vocals, bass, drums, guitar, piano, other).
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
            {/* BPM + Key controls */}
            {mode === "generate" && (
              <div className="flex flex-col items-center gap-3 mt-3">
                {/* BPM row */}
                <div className="flex items-center justify-center gap-2">
                  {analyzing ? (
                    <span className="text-xs text-white/30 animate-pulse">🎵 Detecting BPM…</span>
                  ) : detectedBpm ? (
                    <span className="px-2.5 py-1 rounded-full bg-violet-900/60 border border-violet-500/40 text-violet-200 text-xs font-medium">
                      🥁 {detectedBpm} BPM
                    </span>
                  ) : null}
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
            <button onClick={e => { e.stopPropagation(); setFile(null); setDetectedBpm(null); setManualKey(""); }} className="mt-3 text-xs text-white/30 hover:text-white/60 underline">
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

      {/* Style hint */}
      <input
        type="text"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Style hint (optional) — e.g. 'worship ballad', 'upbeat pop'"
        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 mb-6 focus:outline-none focus:border-violet-500"
      />

      {/* Per-stem sliders (generate mode only) */}
      {mode === "generate" && (
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
                {extraStems.length}/4 slots · {extraStems.length < 2 ? "free" : "Creator/Pro"}
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
                {extraStems.map((variantId, i) => {
                  const label = VARIANT_LABELS[variantId] ?? variantId;
                  const isPaid = i >= 1; // first is free, 2-4 require Creator/Pro
                  return (
                    <div key={variantId} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                      <span className="text-sm text-white/80">{label}</span>
                      <div className="flex items-center gap-2">
                        {isPaid && (
                          <span className="text-[10px] bg-violet-700/60 text-violet-200 px-1.5 py-0.5 rounded-full">Creator+</span>
                        )}
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
                  {extraStems.length >= 2 && (
                    <span className="ml-2 text-violet-300/60">· Creator/Pro plan required</span>
                  )}
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
        {loading ? loadingMsg || "Working…" : mode === "generate" ? "Compose with AI →" : "Separate Stems →"}
      </button>
    </div>
  );
}
