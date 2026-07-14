import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client: S3Client | null = null;

export function getBucket() {
  const bucket = process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not configured");
  return bucket;
}

export function getS3Client() {
  if (s3Client) return s3Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are not configured");
  }

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return s3Client;
}

export async function getUploadUrl(key: string, contentType: string) {
  return getSignedUrl(getS3Client(), new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 });
}

export async function createMultipartUpload(key: string, contentType: string) {
  const res = await getS3Client().send(new CreateMultipartUploadCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  }));
  if (!res.UploadId) throw new Error("Could not start multipart upload");
  return res.UploadId;
}

export async function getMultipartPartUrl(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(getS3Client(), new UploadPartCommand({
    Bucket: getBucket(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  }), { expiresIn: 300 });
}

export async function listMultipartParts(key: string, uploadId: string) {
  const listedParts: Array<{ ETag: string; PartNumber: number }> = [];
  let partNumberMarker: string | undefined;

  do {
    const res = await getS3Client().send(new ListPartsCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      PartNumberMarker: partNumberMarker,
    }));
    for (const part of res.Parts ?? []) {
      if (part.ETag && part.PartNumber) {
        listedParts.push({ ETag: part.ETag, PartNumber: part.PartNumber });
      }
    }
    partNumberMarker = res.NextPartNumberMarker;
  } while (partNumberMarker);

  return listedParts.sort((a, b) => a.PartNumber - b.PartNumber);
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
) {
  await getS3Client().send(new CompleteMultipartUploadCommand({
    Bucket: getBucket(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts as CompletedPart[] },
  }));
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  await getS3Client().send(new AbortMultipartUploadCommand({
    Bucket: getBucket(),
    Key: key,
    UploadId: uploadId,
  }));
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  await getS3Client().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

export function getPublicUrl(key: string) {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) throw new Error("R2_PUBLIC_URL is not configured");
  return `${publicUrl.replace(/\/$/, "")}/${key}`;
}
