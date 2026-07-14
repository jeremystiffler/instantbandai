import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, hashResetToken } from "@/lib/password";

const RESET_IDENTIFIER_PREFIX = "password-reset:";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { email?: string; token?: string; password?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const token = body?.token ?? "";
  const password = body?.password ?? "";

  if (!email || !email.includes("@") || !token) {
    return NextResponse.json({ error: "Invalid reset link." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const identifier = `${RESET_IDENTIFIER_PREFIX}${email}`;
  const tokenHash = hashResetToken(token);
  const resetToken = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: tokenHash } },
  });

  if (!resetToken || resetToken.expires < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password), emailVerified: user.emailVerified ?? new Date() },
    }),
    prisma.verificationToken.deleteMany({ where: { identifier } }),
  ]);

  return NextResponse.json({ ok: true });
}
