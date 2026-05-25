import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUploadUrl } from "@/lib/r2";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { contentType, filename } = await req.json();
  const key = `uploads/${crypto.randomUUID()}-${filename}`;
  const url = await getUploadUrl(key, contentType);
  return NextResponse.json({ url, key });
}
