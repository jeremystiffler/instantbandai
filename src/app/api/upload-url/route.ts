import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getPublicUrl, getUploadUrl } from "@/lib/r2";
import { getAudioContentType, isSupportedAudioFile } from "@/lib/audio-file";

export const dynamic = "force-dynamic";

type UploadUrlPayload = {
  name?: string;
  type?: string;
  size?: number;
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as UploadUrlPayload;
  const fileMeta = { name: body.name ?? "audio-upload", type: body.type ?? "" };

  if (!isSupportedAudioFile(fileMeta)) {
    return NextResponse.json({ error: "Please upload an audio file" }, { status: 400 });
  }
  if (typeof body.size === "number" && body.size > 256 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 256MB)" }, { status: 400 });
  }

  const safeName = fileMeta.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "audio-upload";
  const key = `uploads/${crypto.randomUUID()}-${safeName}`;
  const contentType = getAudioContentType(fileMeta);
  const uploadUrl = await getUploadUrl(key, contentType);
  const publicUrl = getPublicUrl(key);

  return NextResponse.json({ key, uploadUrl, publicUrl, contentType });
}
