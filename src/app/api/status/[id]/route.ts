import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const generation = await prisma.generation.findUnique({
    where: { id },
    include: { stems: true },
  });
  if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(generation);
}
