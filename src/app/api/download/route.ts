import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxy downloads for cross-origin Replicate/R2 URLs so the browser
// triggers a real file download instead of opening in a new tab.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") ?? "track.wav";

  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // Only allow known hosts
  const allowed = ["replicate.delivery", "pub-", ".r2.dev", "r2.cloudflarestorage.com"];
  if (!allowed.some(h => url.includes(h))) {
    return NextResponse.json({ error: "Disallowed host" }, { status: 403 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok) {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "audio/wav";
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
