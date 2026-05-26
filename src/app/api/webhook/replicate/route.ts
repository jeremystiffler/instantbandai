/**
 * Replicate webhook — receives prediction completion events.
 * Replicate POSTs here with the full prediction object when a stem finishes.
 * We scan in-progress generations to find the one owning this prediction ID,
 * then update it instantly — no polling needed.
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const prediction = await req.json().catch(() => null);
  if (!prediction?.id) return NextResponse.json({ ok: true });

  const predId: string = prediction.id;
  const status: string = prediction.status;

  if (!["succeeded", "failed", "canceled"].includes(status)) {
    return NextResponse.json({ ok: true });
  }

  // Find all in-progress generate-mode generations
  const processing = await prisma.generation.findMany({
    where: { status: "processing", mode: "generate" },
    select: { id: true, stemPredictions: true, stems: true },
  });

  // Find which generation owns this prediction
  const gen = processing.find((g) => {
    const preds = (g.stemPredictions ?? {}) as Record<string, string>;
    return Object.values(preds).includes(predId);
  });

  if (!gen) return NextResponse.json({ ok: true });

  const stemPredictions = (gen.stemPredictions ?? {}) as Record<string, string>;
  const currentStems = (gen.stems ?? {}) as Record<string, string>;
  const stem = Object.entries(stemPredictions).find(([, pId]) => pId === predId)?.[0];
  if (!stem) return NextResponse.json({ ok: true });

  if (status === "succeeded" && prediction.output) {
    const url = Array.isArray(prediction.output) ? prediction.output[0] : (prediction.output as string);
    const newStems = { ...currentStems, [stem]: url };
    const totalStems = Object.keys(stemPredictions).length;
    const completedCount = Object.keys(newStems).length;
    const newStatus = completedCount >= totalStems ? "completed" : "processing";

    await prisma.generation.update({
      where: { id: gen.id },
      data: { stems: newStems, status: newStatus },
    });
  } else if (["failed", "canceled"].includes(status)) {
    const completedCount = Object.keys(currentStems).length;
    const totalStems = Object.keys(stemPredictions).length;
    // Only mark fully failed if nothing completed
    if (completedCount === 0 && totalStems > 0) {
      await prisma.generation.update({
        where: { id: gen.id },
        data: { status: "failed" },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
