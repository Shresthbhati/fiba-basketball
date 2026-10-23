import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LocalDiskStorage,
  S3CompatibleStorage,
  TooLargeError,
  createMediaStorage,
} from "../src/media/storage.js";

describe("MediaStorage", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "cq-storage-test-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("stores, reads, measures and removes file via LocalDiskStorage", async () => {
    const storage = new LocalDiskStorage(tmpRoot);
    const content = Buffer.from("basketball game film test payload");

    // Put file
    const size = await storage.put("teams/t1/game1.mp4", Readable.from(content), 1024 * 1024);
    expect(size).toBe(content.length);

    // Size check
    const measuredSize = await storage.size("teams/t1/game1.mp4");
    expect(measuredSize).toBe(content.length);

    // Read full content
    const chunks: Buffer[] = [];
    for await (const chunk of storage.read("teams/t1/game1.mp4")) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe("basketball game film test payload");

    // Read byte range
    const rangeChunks: Buffer[] = [];
    for await (const chunk of storage.read("teams/t1/game1.mp4", { start: 0, end: 9 })) {
      rangeChunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(rangeChunks).toString()).toBe("basketball");

    // Remove
    await storage.remove("teams/t1/game1.mp4");
    expect(await storage.size("teams/t1/game1.mp4")).toBeNull();
  });

  it("enforces maxBytes limit and rolls back partial file", async () => {
    const storage = new LocalDiskStorage(tmpRoot);
    const oversizedContent = Buffer.alloc(5000, "x");

    await expect(
      storage.put("teams/t1/overflow.mp4", Readable.from(oversizedContent), 1000)
    ).rejects.toThrow(TooLargeError);

    expect(await storage.size("teams/t1/overflow.mp4")).toBeNull();
  });

  it("rejects path traversal attempts", async () => {
    const storage = new LocalDiskStorage(tmpRoot);
    const content = Buffer.from("bad");

    await expect(storage.put("../escape.mp4", Readable.from(content), 1000)).rejects.toThrow(
      "invalid storage key"
    );
    await expect(storage.put("/etc/passwd", Readable.from(content), 1000)).rejects.toThrow(
      "invalid storage key"
    );
  });

  it("generates presigned URLs with S3CompatibleStorage", async () => {
    const s3 = new S3CompatibleStorage({
      endpoint: "https://s3.us-east-1.amazonaws.com",
      bucket: "courtiq-films",
      accessKeyId: "TESTKEY",
      secretAccessKey: "TESTSECRET",
    });

    const putUrl = await s3.getPresignedPutUrl("assessment/video.mp4", "video/mp4", 600);
    expect(putUrl).toContain("https://s3.us-east-1.amazonaws.com/courtiq-films/assessment/video.mp4");
    expect(putUrl).toContain("X-Amz-Expires=600");
    expect(putUrl).toContain("content-type=video%2Fmp4");

    const getUrl = await s3.getPresignedGetUrl("assessment/video.mp4", 1200);
    expect(getUrl).toContain("https://s3.us-east-1.amazonaws.com/courtiq-films/assessment/video.mp4");
    expect(getUrl).toContain("X-Amz-Expires=1200");
  });

  it("factory switches between Local and S3 based on environment", () => {
    const local = createMediaStorage({ MEDIA_DIR: tmpRoot });
    expect(local).toBeInstanceOf(LocalDiskStorage);

    const s3 = createMediaStorage({
      S3_BUCKET: "my-bucket",
      S3_ENDPOINT: "https://minio.internal:9000",
      S3_ACCESS_KEY: "minioadmin",
      S3_SECRET_KEY: "miniopassword",
    });
    expect(s3).toBeInstanceOf(S3CompatibleStorage);
  });
});
