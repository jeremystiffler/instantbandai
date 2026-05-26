import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Server-side chord + key + BPM analysis using audio URL
// Uses chromagram approach via Web Audio (called from client via fetch)
// This route just stores/retrieves analysis — actual detection is in /api/analyze/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const generation = await prisma.generation.findUnique({ where: { id } });
  if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    bpm: generation.bpm,
    key: generation.key,
    chords: (generation as any).chords ?? null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bpm, key, chords } = await req.json();

  const updated = await prisma.generation.update({
    where: { id },
    data: {
      bpm: bpm ?? undefined,
      key: key ?? undefined,
      ...(chords !== undefined ? { chords: JSON.stringify(chords) } : {}),
    } as any,
  });

  return NextResponse.json({ ok: true, bpm: updated.bpm, key: updated.key });
}
