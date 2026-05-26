import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const generation = await prisma.generation.findUnique({
    where: { id },
  });
  if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If already done or no replicate ID, just return
  if (["completed", "failed"].includes(generation.status) || !generation.replicateId) {
    return NextResponse.json(generation);
  }

  // Poll Replicate for current status
  const repRes = await fetch(`https://api.replicate.com/v1/predictions/${generation.replicateId}`,
      {
        headers: { "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}` },
      });

  if (!repRes.ok) return NextResponse.json(generation);

  const prediction = await repRes.json();

  if (prediction.status === "succeeded" && prediction.output) {
    // output: { vocals: url, bass: url, drums: url, guitar: url, piano: url, other: url }
    if (!generation.stems) {
      await prisma.generation.update({
        where: { id },
        data: {
          stems: prediction.output,
          status: "completed",
        },
      });
    }
    const updated = await prisma.generation.findUnique({ where: { id } });
    return NextResponse.json(updated);
  }

  if (["failed", "canceled"].includes(prediction.status)) {
    const updated = await prisma.generation.update({
      where: { id },
      data: { status: "failed" },
    });
    return NextResponse.json(updated);
  }

  // Still processing — return current DB state
  return NextResponse.json(generation);
}
