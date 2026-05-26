import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/r2";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const REPLICATE_MODEL = "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key, sourceUrl: providedSourceUrl, prompt } = await req.json();
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Accept either a pre-resolved publicUrl or derive it from key
  const sourceUrl = providedSourceUrl ?? getPublicUrl(key);

  // Start Replicate prediction
  const replicateRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: REPLICATE_MODEL,
      input: {
        input_audio: sourceUrl,
        prompt: prompt ?? "upbeat full band accompaniment",
        duration: 30,
      },
    }),
  });

  if (!replicateRes.ok) {
    const err = await replicateRes.json();
    console.error("Replicate start error:", err);
    return NextResponse.json({ error: "Failed to start generation" }, { status: 500 });
  }

  const prediction = await replicateRes.json();

  const generation = await prisma.generation.create({
    data: {
      userId: user.id,
      sourceUrl,
      status: "processing",
      replicateId: prediction.id,
    },
  });

  return NextResponse.json({ id: generation.id });
}
