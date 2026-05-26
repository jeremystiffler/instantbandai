import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadBuffer } from "@/lib/r2";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const key = `uploads/${crypto.randomUUID()}-${file.name}`;
    await uploadBuffer(key, buffer, file.type || "audio/webm");
    return NextResponse.json({ key });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    console.error("Upload error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
