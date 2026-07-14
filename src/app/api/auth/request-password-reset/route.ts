import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateResetToken, hashResetToken } from "@/lib/password";

const RESET_IDENTIFIER_PREFIX = "password-reset:";
const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function appBaseUrl() {
  return (process.env.NEXTAUTH_URL || "https://instantbandai.com").replace(/\/$/, "");
}

async function sendResetEmail(email: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM || "InstantBandAI <onboarding@resend.dev>";

  if (!apiKey) {
    console.info(`[password-reset] RESEND_API_KEY missing. Reset link for ${email}: ${resetUrl}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Reset your InstantBandAI password",
      text: `Reset your InstantBandAI password here: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2>Reset your InstantBandAI password</h2>
          <p>Click the button below to choose a new password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Reset password</a></p>
          <p>If the button does not work, copy and paste this URL:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[password-reset] Resend failed for ${email}: ${response.status} ${body.slice(0, 500)}`);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { email?: string } | null;
  const email = normalizeEmail(body?.email ?? "");

  // Always return a generic success to avoid account enumeration.
  const generic = NextResponse.json({ ok: true, message: "If that email has an account, a reset link will be sent." });

  if (!email || !email.includes("@")) return generic;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return generic;

  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const identifier = `${RESET_IDENTIFIER_PREFIX}${email}`;
  const expires = new Date(Date.now() + RESET_TTL_MS);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: tokenHash,
      expires,
    },
  });

  const resetUrl = `${appBaseUrl()}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  await sendResetEmail(email, resetUrl);

  return generic;
}
