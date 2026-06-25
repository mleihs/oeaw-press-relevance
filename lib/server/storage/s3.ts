// Generic S3-compatible object storage: MinIO (self-hosted), Cloudflare R2,
// AWS S3 — any S3 API. Configured entirely by env so the SAME code targets a
// MinIO on the VPS today and something else tomorrow with no code change.
//
// Multi-project model: ONE bucket per project (S3_BUCKET); features namespace
// via key prefixes (e.g. social/posts/<id>.jpg). So one shared MinIO can back
// several projects, each with its own bucket + scoped access key.
//
// Env:
//   S3_ENDPOINT            https://s3.example.com   (the S3 API endpoint)
//   S3_ACCESS_KEY_ID       project-scoped key
//   S3_SECRET_ACCESS_KEY   project-scoped secret
//   S3_BUCKET              this project's bucket
//   S3_REGION              optional (default us-east-1; MinIO ignores it)
//   S3_FORCE_PATH_STYLE    optional (default true; MinIO needs path-style)
//
// Helpers throw on misconfiguration; callers decide whether storage is fatal
// (for the social-image path it is NOT — it falls back to the live proxy).

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';

export interface S3Config {
  client: S3Client;
  bucket: string;
}

let cached: S3Config | null = null;

/** Lazily build the S3 client from env. Throws if not configured. */
export function getS3(): S3Config {
  if (cached) return cached;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'S3 storage not configured (need S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET)',
    );
  }
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    // MinIO + most self-hosted S3 need path-style (bucket in the path, not the
    // host subdomain). R2/AWS accept it too. Override with S3_FORCE_PATH_STYLE=false.
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
  });
  cached = { client, bucket };
  return cached;
}

/** Test seam: drop the memoized client so a later getS3() re-reads env. */
export function resetS3(): void {
  cached = null;
}

export interface StoredObject {
  bytes: ArrayBuffer;
  contentType: string;
}

export async function putObject(
  key: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const { client, bucket } = getS3();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      ContentType: contentType,
    }),
  );
}

/** Download an object. Returns null when it doesn't exist (404/NoSuchKey). */
export async function getObject(key: string): Promise<StoredObject | null> {
  const { client, bucket } = getS3();
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const arr = await res.Body.transformToByteArray();
    // Copy into a standalone ArrayBuffer: the SDK's Uint8Array is typed over
    // ArrayBufferLike (incl. SharedArrayBuffer), which Response/BodyInit rejects.
    const bytes = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
    return { bytes, contentType: res.ContentType || 'application/octet-stream' };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Delete keys (chunked to the 1000-per-request S3 limit). */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { client, bucket } = getS3();
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

/** Every object key under a prefix (follows pagination). */
export async function listKeys(prefix: string): Promise<string[]> {
  const { client, bucket } = getS3();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/**
 * Best-effort: ensure the bucket exists. Tolerates a project-scoped key that
 * can't create buckets — then the bucket is assumed pre-provisioned (the way a
 * shared MinIO is set up) and a later upload surfaces any real problem.
 */
export async function ensureBucket(): Promise<void> {
  const { client, bucket } = getS3();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return; // exists and reachable
  } catch (err) {
    // A scoped key may get 403 on HeadBucket even when the bucket exists —
    // only a clear 404 means "missing", anything else → assume it's there.
    if (!isNotFound(err)) return;
  }
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch {
    // No create permission → rely on the bucket being pre-made.
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NoSuchKey' ||
    e?.name === 'NoSuchBucket' ||
    e?.name === 'NotFound' ||
    e?.$metadata?.httpStatusCode === 404
  );
}
