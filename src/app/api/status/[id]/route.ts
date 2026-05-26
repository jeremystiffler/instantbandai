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

  // ─── GENERATE MODE (MusicGen — webhook-driven, just read DB) ────────────────
  // Replicate webhooks update stems + status directly via /api/webhook/replicate.
  // Status route just reads current DB state and returns progress.
  const stemPredictions = (generation.stemPredictions ?? {}) as Record<string, string>;
  const currentStems = (generation.stems ?? {}) as Record<string, string>;

  const extraStemsRaw = (generation as Record<string, unknown>).extraStems;
  const extraStems: string[] = extraStemsRaw
    ? (typeof extraStemsRaw === "string" ? JSON.parse(extraStemsRaw) : (extraStemsRaw as string[]))
    : [];
  const allStemIds = [...GENERATE_STEMS, ...extraStems] as string[];

  // If we have no prediction IDs yet, stems are still being started (stagger in progress)
  const startedCount = Object.keys(stemPredictions).length;
  const completedCount = Object.keys(currentStems).length;
  const totalStems = allStemIds.length;

  // Build per-stem status from what we know: completed=succeeded, started=processing, else queued
  const stemStatuses = Object.fromEntries(
    allStemIds.map((stem) => {
      if (currentStems[stem]) return [stem, "succeeded"];
      if (stemPredictions[stem]) return [stem, "processing"];
      return [stem, "queued"];
    })
  );

  return NextResponse.json({
    ...generation,
    stemProgress: { completed: completedCount, total: totalStems, started: startedCount },
    stemStatuses,
  });
}
