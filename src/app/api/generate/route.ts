import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/r2";
import { NextResponse } from "next/server";
import {
  DEMUCS_VERSION,
  GENERATE_STEMS,
  buildMusicGenInput,
  startAllStemPredictions,
  type GenerateStem,
} from "@/lib/musicgen";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    key,
    sourceUrl: providedSourceUrl,
    mode = "separate", // "separate" | "generate"
    sliders = {},      // { drums:0, bass:0, ... } defaults to 0 per stem
    extraStems = [],   // ["percussion", "acoustic-guitar"] — extra instruments
    bpm,
    musicKey,
    duration = 30,
  } = await req.json();

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const sourceUrl = providedSourceUrl ?? getPublicUrl(key);
  const apiToken = process.env.REPLICATE_API_TOKEN!;

  // ─── SEPARATE MODE (Demucs) ─────────────────────────────────────────────────
  if (mode === "separate") {
    const replicateRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: DEMUCS_VERSION,
        input: {
          audio: sourceUrl,
          model_name: "htdemucs_6s",
          output_format: "mp3",
        },
      }),
    });

    if (!replicateRes.ok) {
      const err = await replicateRes.json().catch(() => ({}));
      console.error("Replicate Demucs error:", err);
      return NextResponse.json({ error: "Failed to start stem separation" }, { status: 500 });
    }

    const prediction = await replicateRes.json();
    const generation = await prisma.generation.create({
      data: {
        userId: user.id,
        sourceUrl,
        status: "processing",
        replicateId: prediction.id,
        mode: "separate",
        bpm: bpm ?? null,
        key: musicKey ?? null,
      },
    });
    return NextResponse.json({ id: generation.id });
  }

  // ─── GENERATE MODE (MusicGen per-stem) ─────────────────────────────────────
  // Fire stems sequentially with 2.5s stagger to avoid Replicate 429 rate limits.
  // Each stem runs in parallel on Replicate's GPU once started — stagger only affects start time.
  const allStemIds = [...GENERATE_STEMS, ...((extraStems as string[]) ?? [])];
  const webhookUrl = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/api/webhook/replicate`
    : undefined;

  // Create the generation record first so webhook can reference it
  const normalizedSliders = Object.fromEntries(allStemIds.map((s) => [s, sliders[s as GenerateStem] ?? 0]));
  const generation = await prisma.generation.create({
    data: {
      userId: user.id,
      sourceUrl,
      status: "processing",
      mode: "generate",
      bpm: bpm ?? null,
      key: musicKey ?? null,
      stemSliders: normalizedSliders,
      stemPredictions: {},
      extraStems: (extraStems as string[])?.length ? extraStems : undefined,
    },
  });

  // Start predictions staggered (non-blocking — we return the generation ID immediately)
  // Use void to fire-and-forget; Vercel function stays alive long enough for all starts
  (async () => {
    const stemPredictions = await startAllStemPredictions(
      allStemIds,
      (stem) => buildMusicGenInput(stem as GenerateStem, sliders[stem] ?? 0, sourceUrl, bpm, musicKey, duration),
      apiToken,
      webhookUrl,
      2500
    );
    if (Object.keys(stemPredictions).length > 0) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { stemPredictions },
      });
    } else {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed" },
      });
    }
  })();

  return NextResponse.json({ id: generation.id });
}
