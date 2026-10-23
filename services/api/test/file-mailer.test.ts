import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileMailer } from "../src/identity/file-mailer.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });

describe("FileMailer", () => {
  it("creates the directory and writes each mail as a JSON file, oldest first", async () => {
    root = await mkdtemp(join(tmpdir(), "outbox-"));
    const dir = join(root, "nested", "outbox");
    const m = new FileMailer(dir);
    await m.send({ to: "a@example.com", subject: "One", text: "first link" });
    await m.send({ to: "b@example.com", subject: "Two", text: "second link" });
    const files = (await readdir(dir)).sort();
    expect(files).toHaveLength(2);
    const first = JSON.parse(await readFile(join(dir, files[0]!), "utf8"));
    const second = JSON.parse(await readFile(join(dir, files[1]!), "utf8"));
    expect(first).toMatchObject({ to: "a@example.com", subject: "One", text: "first link" });
    expect(typeof first.sentAt).toBe("string");
    expect(second.to).toBe("b@example.com");
  });
});
