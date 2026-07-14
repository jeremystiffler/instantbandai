import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadBuffer, getPublicUrl } from "@/lib/r2";
import { NextResponse } from "next/server";
import { getAudioContentType, isSupportedAudioFile } from "@/lib/audio-file";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    if (!isSupportedAudioFile(file)) {
      return NextResponse.json({ error: "Please upload an audio file" }, { status: 400 });
    }
    if (file.size > 256 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 256MB)" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const key = `uploads/${crypto.randomUUID()}-${safeName}`;
    await uploadBuffer(key, buffer, getAudioContentType(file));
    const publicUrl = getPublicUrl(key);
    return NextResponse.json({ key, publicUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    console.error("Upload error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
