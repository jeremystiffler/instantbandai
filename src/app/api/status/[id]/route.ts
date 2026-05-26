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

  // ─── GENERATE MODE (MusicGen — per-stem prediction IDs) ────────────────────
  const stemPredictions = (generation.stemPredictions ?? {}) as Record<string, string>;
  const currentStems = (generation.stems ?? {}) as Record<string, string>;

  // Determine full list of stems to poll (base + extras)
  const extraStemsRaw = (generation as Record<string, unknown>).extraStems;
  const extraStems: string[] = extraStemsRaw
    ? (typeof extraStemsRaw === "string" ? JSON.parse(extraStemsRaw) : (extraStemsRaw as string[]))
    : [];
  const allStemIds = [...GENERATE_STEMS, ...extraStems] as string[];

  // Poll all still-running stems in parallel
  const polls = await Promise.all(
    allStemIds.map(async (stem) => {
      const predId = stemPredictions[stem];
      // Already completed or no prediction ID
      if (!predId || currentStems[stem]) return { stem, url: currentStems[stem] ?? null, status: "done" };

      const res = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
        headers: { Authorization: `Token ${apiToken}` },
      });
      if (!res.ok) return { stem, url: null, status: "unknown" };
      const p = await res.json();

      if (p.status === "succeeded" && p.output) {
        // MusicGen returns output as string[] — grab first element
        const url = Array.isArray(p.output) ? p.output[0] : p.output as string;
        return { stem, url, status: "succeeded" };
      }
      if (["failed", "canceled"].includes(p.status)) {
        return { stem, url: null, status: "failed" };
      }
      return { stem, url: null, status: p.status as string };
    })
  );

  // Merge newly-completed stem URLs into currentStems
  const newStems = { ...currentStems };
  let anyNew = false;
  for (const { stem, url, status } of polls) {
    if ((status === "succeeded" || status === "done") && url) {
      newStems[stem] = url;
      if (status === "succeeded") anyNew = true;
    }
  }

  const totalStems = allStemIds.length;
  const completedCount = Object.keys(newStems).length;
  const anyFailed = polls.some((p) => p.status === "failed");
  const allDone = completedCount >= totalStems;
  const newStatus = allDone ? "completed" : anyFailed && completedCount === 0 ? "failed" : "processing";

  if (anyNew || newStatus !== generation.status) {
    const updated = await prisma.generation.update({
      where: { id },
      data: { stems: newStems, status: newStatus },
    });
    return NextResponse.json({
      ...updated,
      stemProgress: { completed: completedCount, total: totalStems },
    });
  }

  return NextResponse.json({
    ...generation,
    stemProgress: { completed: completedCount, total: totalStems },
  });
}
