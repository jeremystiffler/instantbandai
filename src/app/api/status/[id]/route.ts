import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { GENERATE_STEMS } from "@/lib/musicgen";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const generation = await prisma.generation.findUnique({ where: { id } });
  if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Already settled
  if (["completed", "failed"].includes(generation.status)) {
    return NextResponse.json(generation);
  }

  const apiToken = process.env.REPLICATE_API_TOKEN!;

  // ─── SEPARATE MODE (Demucs — single prediction ID) ──────────────────────────
  if (generation.mode === "separate" || !generation.mode) {
    if (!generation.replicateId) return NextResponse.json(generation);

    const repRes = await fetch(
      `https://api.replicate.com/v1/predictions/${generation.replicateId}`,
      { headers: { Authorization: `Token ${apiToken}` } }
    );
    if (!repRes.ok) return NextResponse.json(generation);

    const prediction = await repRes.json();

    if (prediction.status === "succeeded" && prediction.output) {
      const updated = await prisma.generation.update({
        where: { id },
        data: { stems: prediction.output, status: "completed" },
      });
      return NextResponse.json(updated);
    }
    if (["failed", "canceled"].includes(prediction.status)) {
      const updated = await prisma.generation.update({
        where: { id },
        data: { status: "failed" },
      });
      return NextResponse.json(updated);
    }
    return NextResponse.json(generation);
  }

  // ─── GENERATE MODE: hybrid — webhook-driven but with Replicate fallback poll ─
  const stemPredictions = (generation.stemPredictions ?? {}) as Record<string, string>;
  const currentStems = (generation.stems ?? {}) as Record<string, string>;

  const extraStemsRaw = (generation as Record<string, unknown>).extraStems;
  const extraStems: string[] = extraStemsRaw
    ? (typeof extraStemsRaw === "string" ? JSON.parse(extraStemsRaw) : (extraStemsRaw as string[]))
    : [];
  const allStemIds = [...GENERATE_STEMS, ...extraStems] as string[];

  // Find stems that have a prediction ID but no completed audio yet — poll these directly
  const pendingStems = allStemIds.filter(
    (s) => stemPredictions[s] && !currentStems[s]
  );

  let updatedStems = { ...currentStems };

  if (pendingStems.length > 0) {
    const polls = await Promise.all(
      pendingStems.map(async (stem) => {
        const predId = stemPredictions[stem];
        try {
          const res = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
            headers: { Authorization: `Token ${apiToken}` },
          });
          if (!res.ok) return null;
          const pred = await res.json();
          if (pred.status === "succeeded" && pred.output) {
            const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
            return { stem, url };
          }
        } catch { /* ignore */ }
        return null;
      })
    );

    const newlyDone = polls.filter(Boolean) as { stem: string; url: string }[];
    if (newlyDone.length > 0) {
      for (const { stem, url } of newlyDone) updatedStems[stem] = url;
      const allDone = allStemIds.every((s) => updatedStems[s]);
      await prisma.generation.update({
        where: { id },
        data: { stems: updatedStems, status: allDone ? "completed" : "processing" },
      });
      if (allDone) {
        return NextResponse.json({ ...generation, stems: updatedStems, status: "completed" });
      }
    }
  }

  const startedCount = Object.keys(stemPredictions).length;
  const completedCount = Object.keys(updatedStems).length;
  const totalStems = allStemIds.length;

  const stemStatuses = Object.fromEntries(
    allStemIds.map((stem) => {
      if (updatedStems[stem]) return [stem, "succeeded"];
      if (stemPredictions[stem]) return [stem, "processing"];
      return [stem, "queued"];
    })
  );

  return NextResponse.json({
    ...generation,
    stems: updatedStems,
    stemProgress: { completed: completedCount, total: totalStems, started: startedCount },
    stemStatuses,
  });
}
