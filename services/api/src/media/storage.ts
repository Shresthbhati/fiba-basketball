import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";

export class TooLargeError extends Error {}

export interface MediaStorage {
  /** Stores the stream under `key`. Throws TooLargeError (and stores nothing) if it exceeds `maxBytes`. Returns the size. */
  put(key: string, body: Readable, maxBytes: number): Promise<number>;
  size(key: string): Promise<number | null>;
  read(key: string, range?: { start: number; end: number }): Readable;
  remove(key: string): Promise<void>;
}

/** Files on a local disk or mounted volume. An S3-compatible implementation can replace this behind the same interface (ADR-0014). */
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
}
