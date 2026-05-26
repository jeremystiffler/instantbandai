import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/r2";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const REPLICATE_MODEL = "25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953"; // Demucs 6s

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key, sourceUrl: providedSourceUrl } = await req.json();
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Accept either a pre-resolved publicUrl or derive it from key
  const sourceUrl = providedSourceUrl ?? getPublicUrl(key);

  // Start Replicate prediction (Demucs stem separation)
  const replicateRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: REPLICATE_MODEL,
      input: {
        audio: sourceUrl,
        model_name: "htdemucs_6s",
        output_format: "mp3",
      },
    }),
  });

  if (!replicateRes.ok) {
    const err = await replicateRes.json();
    console.error("Replicate start error:", err);
    return NextResponse.json({ error: "Failed to start stem separation" }, { status: 500 });
  }

  const prediction = await replicateRes.json();

  const generation = await prisma.generation.create({
    data: {
      userId: user.id,
      sourceUrl,
      status: "processing",
      replicateId: prediction.id,
      stems: undefined,
      bpm: null,
      key: null,
    },
  });

  return NextResponse.json({ id: generation.id });
}
