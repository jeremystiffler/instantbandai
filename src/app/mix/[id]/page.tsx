"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Generation = {
  id: string;
  status: string;
  stems: { id: string; instrument: string; url: string }[];
};

export default function MixPage() {
  const params = useParams();
  const id = params?.id as string;
  const [gen, setGen] = useState<Generation | null>(null);

  useEffect(() => {
    if (!id) return;
    const poll = async () => {
      const res = await fetch(`/api/status/${id}`);
      const data = await res.json();
      setGen(data);
      if (data.status !== "complete" && data.status !== "failed") {
        setTimeout(poll, 3000);
      }
    };
    poll();
  }, [id]);

  if (!gen) return <div className="flex items-center justify-center min-h-[60vh] text-white/50">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Your Mix</h1>
      <p className={`text-sm mb-8 ${gen.status === "complete" ? "text-green-400" : gen.status === "failed" ? "text-red-400" : "text-yellow-400"}`}>
        {gen.status === "complete" ? "✓ Ready" : gen.status === "failed" ? "✗ Failed" : "⏳ Generating stems…"}
      </p>
      {gen.status !== "complete" && gen.status !== "failed" && (
        <div className="space-y-3">
          {["drums","bass","guitar","keys","mix"].map(inst => (
            <div key={inst} className="h-16 bg-white/5 rounded-lg animate-pulse flex items-center px-4">
              <span className="text-white/30 capitalize">{inst}</span>
            </div>
          ))}
        </div>
      )}
      {gen.status === "complete" && (
        <div className="space-y-4">
          {gen.stems.map(stem => (
            <div key={stem.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <span className="capitalize font-medium">{stem.instrument}</span>
              <div className="flex gap-3">
                <audio controls src={stem.url} className="h-8" />
                <a href={stem.url} download className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm transition">
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
