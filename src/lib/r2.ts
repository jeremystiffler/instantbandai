import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function getUploadUrl(key: string, contentType: string) {
  return getSignedUrl(s3, new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 });
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

export function getPublicUrl(key: string) {
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
