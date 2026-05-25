import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest";
import { getPublicUrl } from "@/lib/r2";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key, prompt } = await req.json();
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const sourceUrl = getPublicUrl(key);
  const generation = await prisma.generation.create({
    data: { userId: user.id, sourceUrl, status: "pending" },
  });
  await inngest.send({ name: "generation/requested", data: { generationId: generation.id, sourceUrl } });
  return NextResponse.json({ id: generation.id });
}
