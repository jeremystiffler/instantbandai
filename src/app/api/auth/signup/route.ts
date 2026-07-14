import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { email?: string; password?: string; name?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";
  const name = body?.name?.trim() || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    return NextResponse.json({ error: "An account already exists for that email. Sign in instead." }, { status: 409 });
  }

  if (existing && !existing.passwordHash) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: hashPassword(password), name: existing.name ?? name },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      emailVerified: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
