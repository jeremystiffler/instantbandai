"use client";
import { useSession, signIn } from "next-auth/react";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function StudioPage() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  if (status === "loading") return <div className="flex items-center justify-center min-h-[60vh] text-white/50">Loading...</div>;
  if (!session) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-white/60">Sign in to use the studio</p>
      <button onClick={() => signIn("google")} className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-lg font-medium transition">
        Sign in with Google
      </button>
    </div>
  );

  async function handleGenerate() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, filename: file.name }),
      });
      const { url, key } = await uploadRes.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, prompt }),
      });
      const { id } = await genRes.json();
      router.push(`/mix/${id}`);
    } catch (e) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Studio</h1>
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-white/20 hover:border-violet-500 rounded-xl p-12 text-center cursor-pointer transition mb-6"
      >
        {file ? (
          <p className="text-violet-400 font-medium">{file.name}</p>
        ) : (
          <>
            <p className="text-white/60 mb-2">Drop your audio file here</p>
            <p className="text-white/30 text-sm">MP3, WAV, M4A up to 50MB</p>
          </>
        )}
        <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <input
        type="text"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Style hint (optional) — e.g. 'worship ballad', 'upbeat pop'"
        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 mb-6 focus:outline-none focus:border-violet-500"
      />
      {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
      <button
        onClick={handleGenerate}
        disabled={!file || loading}
        className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition"
      >
        {loading ? "Uploading…" : "Generate Stems →"}
      </button>
    </div>
  );
}
