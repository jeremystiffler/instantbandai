import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPLICATE_MODEL = "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { generationId, prompt } = await req.json();
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

  // Start a new Replicate prediction with same audio, new prompt
  const replicateRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: REPLICATE_MODEL,
      input: {
        music_input: original.sourceUrl,
        prompt: prompt ?? "upbeat full band accompaniment",
        duration: 30,
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
    },
  });

  return NextResponse.json({ id: newGen.id });
}
