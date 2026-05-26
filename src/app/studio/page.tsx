"use client";
import { useSession, signIn } from "next-auth/react";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { genUploader } from "uploadthing/client";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  // --- Drag & Drop ---
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith("audio/")) { setFile(dropped); setError(""); }
    else setError("Please drop an audio file (MP3, WAV, M4A).");
  }, []);

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
    if (val <= 15) return "Mirror";
    if (val <= 40) return "Close";
    if (val <= 65) return "Blend";
    if (val <= 85) return "Inspired";
    return "Original";
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
          prompt,
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
          ✂️ Separate Stems
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
        onClick={() => !recording && inputRef.current?.click()}
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
            <button onClick={e => { e.stopPropagation(); setFile(null); }} className="mt-3 text-xs text-white/30 hover:text-white/60 underline">
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
        <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={e => { setFile(e.target.files?.[0] ?? null); setError(""); }} />
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
            <span>← Mirror structure</span>
            <span>Original →</span>
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
