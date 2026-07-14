import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  getMultipartPartUrl,
  getPublicUrl,
  listMultipartParts,
} from "@/lib/r2";
import { getAudioContentType, isSupportedAudioFile } from "@/lib/audio-file";

export const dynamic = "force-dynamic";

type InitPayload = {
  action: "init";
  name?: string;
  type?: string;
  size?: number;
};

type PartPayload = {
  action: "part";
  key?: string;
  uploadId?: string;
  partNumber?: number;
};

type CompletePayload = {
  action: "complete";
  key?: string;
  uploadId?: string;
  partNumbers?: number[];
  parts?: Array<{ ETag?: string; PartNumber?: number }>;
};

type AbortPayload = {
  action: "abort";
  key?: string;
  uploadId?: string;
};

type MultipartPayload = InitPayload | PartPayload | CompletePayload | AbortPayload;

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

function validateOwnedUploadKey(key: unknown): key is string {
  return typeof key === "string" && /^uploads\/[0-9a-f-]+-[^/]+$/i.test(key);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<MultipartPayload>;

  if (body.action === "init") {
    const fileMeta = { name: body.name ?? "audio-upload", type: body.type ?? "" };
    if (!isSupportedAudioFile(fileMeta)) {
      return NextResponse.json({ error: "Please upload an audio file" }, { status: 400 });
    }
    if (typeof body.size === "number" && body.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 256MB)" }, { status: 400 });
    }

    const safeName = fileMeta.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "audio-upload";
    const key = `uploads/${crypto.randomUUID()}-${safeName}`;
    const contentType = getAudioContentType(fileMeta);
    const uploadId = await createMultipartUpload(key, contentType);
    return NextResponse.json({ key, uploadId, publicUrl: getPublicUrl(key), contentType });
  }

  if (body.action === "part") {
    if (!validateOwnedUploadKey(body.key) || typeof body.uploadId !== "string") {
      return NextResponse.json({ error: "Invalid multipart upload" }, { status: 400 });
    }
    const partNumber = body.partNumber;
    if (typeof partNumber !== "number" || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      return NextResponse.json({ error: "Invalid part number" }, { status: 400 });
    }

    const uploadUrl = await getMultipartPartUrl(body.key, body.uploadId, partNumber);
    return NextResponse.json({ uploadUrl });
  }

  if (body.action === "complete") {
    if (!validateOwnedUploadKey(body.key) || typeof body.uploadId !== "string") {
      return NextResponse.json({ error: "Invalid multipart upload" }, { status: 400 });
    }
    const providedParts = (body.parts ?? [])
      .filter((part): part is { ETag: string; PartNumber: number } =>
        typeof part.ETag === "string" &&
        typeof part.PartNumber === "number" &&
        Number.isInteger(part.PartNumber) &&
        part.PartNumber > 0
      )
      .map((part) => ({ ETag: part.ETag, PartNumber: part.PartNumber }));

    const requestedPartNumbers = new Set(
      (body.partNumbers ?? [])
        .filter((partNumber) => typeof partNumber === "number" && Number.isInteger(partNumber) && partNumber > 0)
    );

    const parts = providedParts.length
      ? providedParts.sort((a, b) => a.PartNumber - b.PartNumber)
      : (await listMultipartParts(body.key, body.uploadId))
          .filter((part) => !requestedPartNumbers.size || requestedPartNumbers.has(part.PartNumber))
          .sort((a, b) => a.PartNumber - b.PartNumber);

    if (!parts.length) return NextResponse.json({ error: "No uploaded parts provided" }, { status: 400 });
    if (requestedPartNumbers.size && parts.length !== requestedPartNumbers.size) {
      return NextResponse.json({ error: "Some uploaded parts are missing" }, { status: 400 });
    }

    await completeMultipartUpload(body.key, body.uploadId, parts);
    return NextResponse.json({ key: body.key, publicUrl: getPublicUrl(body.key) });
  }

  if (body.action === "abort") {
    if (validateOwnedUploadKey(body.key) && typeof body.uploadId === "string") {
      await abortMultipartUpload(body.key, body.uploadId).catch((error) => {
        console.error("Multipart abort failed", error);
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid multipart action" }, { status: 400 });
}
