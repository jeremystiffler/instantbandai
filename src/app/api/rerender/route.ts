import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  DEMUCS_VERSION,
  STABLE_AUDIO_VERSION,
  buildLoopInput,
  startPrediction,
  type GenerateStem,
  GENERATE_STEMS,
} from "@/lib/musicgen";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { generationId, stem, slider } = await req.json();
  if (!generationId)
    return NextResponse.json({ error: "Missing generationId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const original = await prisma.generation.findUnique({ where: { id: generationId } });
  if (!original || original.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apiToken = process.env.REPLICATE_API_TOKEN!;

  // ─── SEPARATE MODE — re-run full Demucs prediction ─────────────────────────
  if (original.mode === "separate" || !original.mode) {
    const replicateRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: { Authorization: `Token ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        version: DEMUCS_VERSION,
        input: { audio: original.sourceUrl, model_name: "htdemucs_6s", output_format: "mp3" },
      }),
    });
    if (!replicateRes.ok) {
      const err = await replicateRes.json().catch(() => ({}));
      console.error("Replicate re-render error:", err);
      return NextResponse.json({ error: "Failed to start re-render" }, { status: 500 });
    }
    const prediction = await replicateRes.json();
    const newGen = await prisma.generation.create({
      data: {
        userId: user.id,
        sourceUrl: original.sourceUrl,
        status: "processing",
        replicateId: prediction.id,
        mode: "separate",
        bpm: original.bpm,
        key: original.key,
      },
    });
    return NextResponse.json({ id: newGen.id });
  }

  // ─── GENERATE MODE — re-render one or all stems ─────────────────────────────
  const currentSliders = (original.stemSliders ?? {}) as Record<string, number>;
  const currentPredictions = (original.stemPredictions ?? {}) as Record<string, string>;
  const currentStems = (original.stems ?? {}) as Record<string, string>;

  const stemsToRender: GenerateStem[] = stem
    ? [stem as GenerateStem]
    : [...GENERATE_STEMS];

  const newPredictions = { ...currentPredictions };
  const updatedStems = { ...currentStems };
  const updatedSliders = { ...currentSliders };

  for (const s of stemsToRender) {
    const sliderVal = slider !== undefined ? (slider as number) : (currentSliders[s] ?? 0);
    updatedSliders[s] = sliderVal;
    // Clear existing stem URL so status polling picks up the new prediction
    delete updatedStems[s];
    const input = buildLoopInput(
      s,
      original.bpm ?? 120,
      original.key ?? undefined
    );
    try {
      const predId = await startPrediction(STABLE_AUDIO_VERSION, input as unknown as Record<string, unknown>, apiToken);
      newPredictions[s] = predId;
    } catch (e) {
      console.error(`MusicGen rerender failed for ${s}:`, e);
    }
  }

  const updated = await prisma.generation.update({
    where: { id: generationId },
    data: {
      status: "processing",
      stems: updatedStems,
      stemPredictions: newPredictions,
      stemSliders: updatedSliders,
    },
  });

  return NextResponse.json({ id: updated.id });
}
