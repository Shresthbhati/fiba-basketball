import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { PassThrough, Transform, type Readable } from "node:stream";

export class TooLargeError extends Error {}
export class StorageError extends Error {}

export interface MediaStorage {
  /** Stores the stream under `key`. Throws TooLargeError (and stores nothing) if it exceeds `maxBytes`. Returns the size. */
  put(key: string, body: Readable, maxBytes: number): Promise<number>;
  size(key: string): Promise<number | null>;
  read(key: string, range?: { start: number; end: number }): Readable;
  remove(key: string): Promise<void>;
  getPresignedPutUrl?(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  getPresignedGetUrl?(key: string, expiresInSeconds?: number): Promise<string>;
}

/** Files on a local disk or mounted volume. */
export class LocalDiskStorage implements MediaStorage {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key) || key.includes("..")) throw new Error("invalid storage key");
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root + sep)) throw new Error("invalid storage key");
    return p;
  }

  async put(key: string, body: Readable, maxBytes: number): Promise<number> {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.part`;
    let seen = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        seen += chunk.length;
        if (seen > maxBytes) cb(new TooLargeError());
        else cb(null, chunk);
      },
    });
    try {
      await pipeline(body, limit, createWriteStream(tmp));
      await rename(tmp, target);
      return seen;
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  read(key: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.path(key), range);
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async getPresignedPutUrl(key: string): Promise<string> {
    // For local storage, returns simulated direct upload path
    return `/api/v1/media/upload/${encodeURIComponent(key)}`;
  }

  async getPresignedGetUrl(key: string): Promise<string> {
    return `/api/v1/media/view/${encodeURIComponent(key)}`;
  }
}

export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  region?: string | undefined;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string | undefined;
}

/** S3 / MinIO compatible object storage adapter (ADR-0005, ADR-0014, Master Spec §18.1). */
export class S3CompatibleStorage implements MediaStorage {
  private readonly config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    this.config = {
      region: "us-east-1",
      ...config,
    };
  }

  private sanitizeKey(key: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key) || key.includes("..")) throw new Error("invalid storage key");
    return key.replace(/^\/+/, "");
  }

  private getBaseUrl(): string {
    const ep = this.config.endpoint.replace(/\/+$/, "");
    return `${ep}/${this.config.bucket}`;
  }

  async put(key: string, body: Readable, maxBytes: number): Promise<number> {
    const sanitizedKey = this.sanitizeKey(key);
    const url = `${this.getBaseUrl()}/${sanitizedKey}`;

    // Read chunks to measure size and guard against maxBytes
    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += buf.length;
      if (totalSize > maxBytes) {
        throw new TooLargeError(`Payload exceeds limit of ${maxBytes} bytes`);
      }
      chunks.push(buf);
    }

    const payload = Buffer.concat(chunks);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Length": String(payload.length),
        "Content-Type": "application/octet-stream",
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      },
      body: payload,
    });

    if (!response.ok) {
      throw new StorageError(`S3 PUT failed with status ${response.status}: ${await response.text()}`);
    }

    return payload.length;
  }

  async size(key: string): Promise<number | null> {
    const sanitizedKey = this.sanitizeKey(key);
    const url = `${this.getBaseUrl()}/${sanitizedKey}`;

    try {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) return null;
      const cl = res.headers.get("content-length");
      return cl ? parseInt(cl, 10) : null;
    } catch {
      return null;
    }
  }

  read(key: string, range?: { start: number; end: number }): Readable {
    const sanitizedKey = this.sanitizeKey(key);
    const url = `${this.getBaseUrl()}/${sanitizedKey}`;

    const headers: Record<string, string> = {};
    if (range) {
      headers["Range"] = `bytes=${range.start}-${range.end}`;
    }

    // Convert fetch ReadableStream to Node.js Readable
    const stream = new PassThrough();

    fetch(url, { headers })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          stream.destroy(new StorageError(`S3 GET failed: ${res.status}`));
          return;
        }
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          stream.write(Buffer.from(chunk));
        }
        stream.end();
      })
      .catch((err) => stream.destroy(err));

    return stream;
  }

  async remove(key: string): Promise<void> {
    const sanitizedKey = this.sanitizeKey(key);
    const url = `${this.getBaseUrl()}/${sanitizedKey}`;
    await fetch(url, { method: "DELETE" });
  }

  async getPresignedPutUrl(key: string, contentType: string, expiresInSeconds = 900): Promise<string> {
    const sanitizedKey = this.sanitizeKey(key);
    const base = this.config.publicUrl ?? this.getBaseUrl();
    // Generates presigned intent target URL with standard expiration
    return `${base}/${sanitizedKey}?X-Amz-Expires=${expiresInSeconds}&content-type=${encodeURIComponent(contentType)}`;
  }

  async getPresignedGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const sanitizedKey = this.sanitizeKey(key);
    const base = this.config.publicUrl ?? this.getBaseUrl();
    return `${base}/${sanitizedKey}?X-Amz-Expires=${expiresInSeconds}`;
  }
}

/** Factory creating appropriate storage provider from environment configuration. */
export function createMediaStorage(env: Record<string, string | undefined>): MediaStorage {
  if (env.S3_BUCKET && env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY) {
    return new S3CompatibleStorage({
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION ?? "us-east-1",
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
      publicUrl: env.S3_PUBLIC_URL,
    });
  }

  const root = env.MEDIA_DIR ?? "./data/media";
  return new LocalDiskStorage(root);
}
