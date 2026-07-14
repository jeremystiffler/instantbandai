import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureProjectSchema } from "@/lib/project-schema";

export const dynamic = "force-dynamic";

type ProjectPayload = {
  name?: string;
  audioKey?: string | null;
  audioUrl?: string;
  audioName?: string | null;
  audioSize?: number | null;
  audioType?: string | null;
  duration?: number | null;
  bpm?: number | null;
  key?: string | null;
  mode?: string | null;
  stylePrompt?: string | null;
  midiNotes?: unknown;
  settings?: unknown;
};

async function getUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({ where: { email: session.user.email } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProjectSchema();

  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return NextResponse.json({ project });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProjectSchema();

  const { id } = await params;
  const existing = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = (await req.json()) as ProjectPayload;
  if (!body.audioUrl) {
    return NextResponse.json({ error: "Save needs an uploaded audio file" }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id },
    data: {
      name: body.name?.trim() || body.audioName || existing.name,
      audioKey: body.audioKey ?? null,
      audioUrl: body.audioUrl,
      audioName: body.audioName ?? null,
      audioSize: typeof body.audioSize === "number" ? Math.round(body.audioSize) : null,
      audioType: body.audioType ?? null,
      duration: typeof body.duration === "number" ? body.duration : null,
      bpm: typeof body.bpm === "number" ? body.bpm : null,
      key: body.key ?? null,
      mode: body.mode ?? null,
      stylePrompt: body.stylePrompt ?? null,
      midiNotes: body.midiNotes ?? [],
      settings: body.settings ?? {},
    },
  });

  return NextResponse.json({ project });
}
