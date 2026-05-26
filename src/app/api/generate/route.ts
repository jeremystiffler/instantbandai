import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/r2";
import { NextResponse } from "next/server";
import {
  DEMUCS_VERSION,
  GENERATE_STEMS,
  buildMusicGenInput,
  startMusicGenPrediction,
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
  // Fire all stem predictions in parallel (base + extra)
  const allStemIds = [...GENERATE_STEMS, ...((extraStems as string[]) ?? [])];
  const stemEntries = await Promise.all(
    allStemIds.map(async (stem) => {
      const slider: number = sliders[stem] ?? 0;
      const input = buildMusicGenInput(stem as GenerateStem, slider, sourceUrl, bpm, musicKey, duration);
      try {
        const predId = await startMusicGenPrediction(input, apiToken);
        return [stem, predId] as const;
      } catch (e) {
        console.error(`MusicGen start failed for ${stem}:`, e);
        return [stem, null] as const;
      }
    })
  );

  const stemPredictions = Object.fromEntries(stemEntries.filter(([, id]) => id !== null));
  const normalizedSliders = Object.fromEntries(
    allStemIds.map((s) => [s, sliders[s] ?? 0])
  );

  const generation = await prisma.generation.create({
    data: {
      userId: user.id,
      sourceUrl,
      status: "processing",
      mode: "generate",
      bpm: bpm ?? null,
      key: musicKey ?? null,
      stemSliders: normalizedSliders,
      stemPredictions,
      extraStems: (extraStems as string[])?.length ? extraStems : undefined,
    },
  });

  return NextResponse.json({ id: generation.id });
}
