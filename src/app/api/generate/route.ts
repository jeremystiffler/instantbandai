import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/r2";
import { NextResponse } from "next/server";
import {
  DEMUCS_VERSION,
  ACE_STEP_VERSION,
  GENERATE_STEMS,
  buildLoopInput,
  buildFullMixInput,
  startAllStemPredictions,
  startPrediction,
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
    mode = "loops",        // "separate" | "loops" | "fullmix"
    sliders = {},
    extraStems = [],
    bpm,
    musicKey,
    duration = 45,
    fullMixPrompt = "cinematic, orchestral, emotional, modern",
  } = await req.json();

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const sourceUrl = providedSourceUrl ?? getPublicUrl(key);
  const apiToken = process.env.REPLICATE_API_TOKEN!;
  const baseUrl = (process.env.NEXTAUTH_URL || "https://instantbandai.com").replace(/\/$/, "");
  const webhookUrl = `${baseUrl}/api/webhook/replicate`;

  // ─── SEPARATE MODE (Demucs) ──────────────────────────────────────────────
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

  // ─── FULL MIX MODE (ACE-Step — single stereo track) ─────────────────────
  if (mode === "fullmix") {
    const input = buildFullMixInput(fullMixPrompt, bpm, musicKey, duration);
    const generation = await prisma.generation.create({
      data: {
        userId: user.id,
        sourceUrl,
        status: "processing",
        mode: "fullmix",
        bpm: bpm ?? null,
        key: musicKey ?? null,
        stemPredictions: {},
      },
    });

    (async () => {
      try {
        const predId = await startPrediction(
          ACE_STEP_VERSION,
          input as unknown as Record<string, unknown>,
          apiToken,
          webhookUrl
        );
        await prisma.generation.update({
          where: { id: generation.id },
          data: { stemPredictions: { fullmix: predId } },
        });
      } catch (e) {
        console.error("ACE-Step start failed:", e);
        await prisma.generation.update({
          where: { id: generation.id },
          data: { status: "failed" },
        });
      }
    })();

    return NextResponse.json({ id: generation.id });
  }

  // ─── LOOPS MODE (Stable Audio — per-stem 8s loops) ──────────────────────
  const allStemIds = [...GENERATE_STEMS, ...((extraStems as string[]) ?? [])];
  const normalizedSliders = Object.fromEntries(
    allStemIds.map((s) => [s, sliders[s as GenerateStem] ?? 0])
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
      stemPredictions: {},
      extraStems: (extraStems as string[])?.length ? extraStems : undefined,
    },
  });

  (async () => {
    const stemPredictions = await startAllStemPredictions(
      allStemIds,
      (stem) => buildLoopInput(stem, bpm, musicKey),
      apiToken,
      webhookUrl,
      2000
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
