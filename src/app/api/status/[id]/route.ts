import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const INSTRUMENTS = ["mix", "drums", "bass", "guitar", "keys"];

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const generation = await prisma.generation.findUnique({
    where: { id },
    include: { stems: true },
  });
  if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If already done or no replicate ID, just return
  if (generation.status === "complete" || generation.status === "failed" || !generation.replicateId) {
    return NextResponse.json(generation);
  }

  // Poll Replicate for current status
  const repRes = await fetch(`https://api.replicate.com/v1/predictions/${generation.replicateId}`, {
    headers: { "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}` },
  });

  if (!repRes.ok) return NextResponse.json(generation);

  const prediction = await repRes.json();

  if (prediction.status === "succeeded" && prediction.output) {
    const outputs: string[] = Array.isArray(prediction.output) ? prediction.output : [prediction.output];
    // Save stems if not already saved
    if (generation.stems.length === 0) {
      for (let i = 0; i < outputs.length; i++) {
        await prisma.stem.create({
          data: {
            generationId: id,
            name: INSTRUMENTS[i] ?? `stem-${i}`,
            url: outputs[i],
          },
        });
      }
    }
    const updated = await prisma.generation.update({
      where: { id },
      data: { status: "complete" },
      include: { stems: true },
    });
    return NextResponse.json(updated);
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    const updated = await prisma.generation.update({
      where: { id },
      data: { status: "failed" },
      include: { stems: true },
    });
    return NextResponse.json(updated);
  }

  // Still processing — return current DB state
  return NextResponse.json(generation);
}
