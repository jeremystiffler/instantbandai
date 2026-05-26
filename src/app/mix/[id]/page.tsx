"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

type Stem = { id: string; name: string; url: string };
type Generation = {
  id: string;
  status: string;
  sourceUrl: string;
  stems: Stem[];
};

const SKELETON_NAMES = ["mix", "drums", "bass", "guitar", "keys"];

function DownloadButton({ stem }: { stem: Stem }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const filename = `${stem.name}.wav`;
      const res = await fetch(
        `/api/download?url=${encodeURIComponent(stem.url)}&filename=${encodeURIComponent(filename)}`
      );
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition"
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      )}
      {loading ? "Downloading…" : "Download"}
    </button>
  );
}

function ReRenderPanel({ generationId }: { generationId: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function handleReRender() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rerender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Re-render failed");
      router.push(`/mix/${data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-6 w-full py-3 border border-white/10 hover:border-violet-500/50 bg-white/5 hover:bg-violet-500/10 rounded-xl text-sm font-medium text-white/70 hover:text-white transition flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Re-render with different style
      </button>
    );
  }

  return (
    <div className="mt-6 bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Re-render</h3>
        <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60 text-sm">✕</button>
      </div>
      <p className="text-white/50 text-sm">Same audio, new vibe. Describe the sound you want.</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          "worship ballad with soft piano",
          "upbeat rock band, driving drums",
          "ambient synth pad, no drums",
          "country acoustic, fingerpicked guitar",
          "jazz trio, walking bass",
          "lo-fi hip hop, mellow keys",
        ].map(preset => (
          <button
            key={preset}
            onClick={() => setPrompt(preset)}
            className={`px-3 py-2 rounded-lg border text-left transition ${
              prompt === preset
                ? "border-violet-500 bg-violet-500/20 text-violet-300"
                : "border-white/10 bg-white/5 text-white/50 hover:border-white/30 hover:text-white/70"
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Or type your own style…"
        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-violet-500 text-sm"
      />

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        onClick={handleReRender}
        disabled={loading || !prompt.trim()}
        className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-semibold transition"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Starting re-render…
          </span>
        ) : "Re-render →"}
      </button>
    </div>
  );
}

export default function MixPage() {
  const params = useParams();
  const id = params?.id as string;
  const [gen, setGen] = useState<Generation | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/status/${id}`);
    const data = await res.json();
    setGen(data);
    if (data.status !== "complete" && data.status !== "failed") {
      setTimeout(poll, 3000);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    poll();
  }, [id, poll]);

  if (!gen) return (
    <div className="flex items-center justify-center min-h-[60vh] text-white/50">Loading…</div>
  );

  const isProcessing = gen.status !== "complete" && gen.status !== "failed";

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="flex items-center gap-3 mb-2">
        <a href="/studio" className="text-white/30 hover:text-white/60 text-sm transition">← Studio</a>
      </div>

      <h1 className="text-3xl font-bold mb-2">Your Mix</h1>
      <p className={`text-sm mb-8 ${
        gen.status === "complete" ? "text-green-400" :
        gen.status === "failed" ? "text-red-400" : "text-yellow-400"
      }`}>
        {gen.status === "complete" ? "✓ Ready to download" :
         gen.status === "failed" ? "✗ Generation failed" :
         "⏳ Generating… this takes 15–60 seconds"}
      </p>

      {/* Skeleton loaders while processing */}
      {isProcessing && (
        <div className="space-y-3">
          {SKELETON_NAMES.map(name => (
            <div key={name} className="h-16 bg-white/5 rounded-xl animate-pulse flex items-center px-4 gap-3">
              <span className="text-white/20 capitalize text-sm">{name}</span>
            </div>
          ))}
          <p className="text-center text-white/30 text-xs mt-4 animate-pulse">
            MusicGen is cooking your arrangement…
          </p>
        </div>
      )}

      {/* Stems */}
      {gen.status === "complete" && (
        <>
          <div className="space-y-3">
            {gen.stems.map(stem => (
              <div
                key={stem.id}
                className="bg-white/5 border border-white/10 hover:border-white/20 rounded-xl p-4 transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="capitalize font-semibold text-white">{stem.name}</span>
                  <DownloadButton stem={stem} />
                </div>
                <audio
                  controls
                  src={stem.url}
                  className="w-full h-8"
                  style={{ colorScheme: "dark" }}
                />
              </div>
            ))}
          </div>

          {/* Download all button */}
          {gen.stems.length > 1 && (
            <button
              onClick={async () => {
                for (const stem of gen.stems) {
                  const filename = `${stem.name}.wav`;
                  const res = await fetch(
                    `/api/download?url=${encodeURIComponent(stem.url)}&filename=${encodeURIComponent(filename)}`
                  );
                  const blob = await res.blob();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = filename;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  await new Promise(r => setTimeout(r, 400));
                }
              }}
              className="mt-4 w-full py-3 border border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium text-white/70 hover:text-white transition"
            >
              ↓ Download All Tracks
            </button>
          )}

          <ReRenderPanel generationId={gen.id} />
        </>
      )}

      {gen.status === "failed" && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400 mb-4">Generation failed. Try again with a different audio file.</p>
          <a href="/studio" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm transition">
            Back to Studio
          </a>
        </div>
      )}
    </div>
  );
}
