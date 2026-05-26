import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPLICATE_MODEL = "25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953"; // Demucs 6s

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { generationId } = await req.json();
  if (!generationId)
    return NextResponse.json({ error: "Missing generationId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Fetch original generation to get the source URL
  const original = await prisma.generation.findUnique({
    where: { id: generationId },
  });
  if (!original || original.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Start a new Replicate prediction with same audio (Demucs rerun)
  const replicateRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: REPLICATE_MODEL,
      input: {
        audio: original.sourceUrl,
        model_name: "htdemucs_6s",
        output_format: "mp3",
      },
    }),
  });

  if (!replicateRes.ok) {
    const err = await replicateRes.json();
    console.error("Replicate re-render error:", err);
    return NextResponse.json({ error: "Failed to start re-render" }, { status: 500 });
  }

  const prediction = await replicateRes.json();

  // Create a new generation record linked to same source
  const newGen = await prisma.generation.create({
    data: {
      userId: user.id,
      sourceUrl: original.sourceUrl,
      status: "processing",
      replicateId: prediction.id,
      stems: undefined,
      bpm: null,
      key: null,
    },
  });

  return NextResponse.json({ id: newGen.id });
}
