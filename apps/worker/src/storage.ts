import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export async function readAttachment(fileUrl: string): Promise<Uint8Array> {
  const key = new URL(fileUrl, "http://localhost").searchParams.get("key");
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/") || key.split("/").length !== 2) throw new Error("Invalid storage key");
  const bucket = process.env.AWS_S3_BUCKET, accessKeyId = process.env.AWS_ACCESS_KEY_ID, secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (bucket && accessKeyId && secretAccessKey) {
    const client = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-1", credentials: { accessKeyId, secretAccessKey }, ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false" } : {}) });
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(120_000) });
    if (!result.Body || Number(result.ContentLength) > 50 * 1024 * 1024) throw new Error("Missing or oversized stored file");
    return result.Body.transformToByteArray();
  }
  if (process.env.NODE_ENV === "production") throw new Error("S3 storage is not configured");
  return readFile(path.resolve(fileURLToPath(new URL("../../web/.uploads/", import.meta.url)), key));
}
