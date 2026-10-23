import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const run = Date.now().toString(36);

function makeVideo(): string {
  const file = join(mkdtempSync(join(tmpdir(), "film-sync-e2e-")), "game.webm");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=6:size=160x120:rate=10", "-c:v", "libvpx", "-b:v", "100k", file]);
  return file;
}

test("film sync: score a game, line the film up with it, and click the scorebook timeline to jump the video", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Sy Sync");
  await page.getByLabel("Date of birth").fill("1990-04-02");
  await page.getByLabel("Email").fill(`sync-${run}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);

  // A published two-team competition (the organizer coaches both teams), then score two baskets 3 seconds apart.
  await page.goto("/competitions/new");
  await page.getByLabel("Name").fill(`Sync Cup ${run}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: `Sync Cup ${run}` })).toBeVisible();
  for (const name of ["Comets", "Blazers"]) {
    await page.getByLabel("Team name").fill(name);
    await page.getByRole("button", { name: "Add team" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }
  await page.getByRole("button", { name: "Create schedule and publish" }).click();
  await expect(page.getByText("Under way")).toBeVisible();
  await page.getByRole("link", { name: "Open scorer" }).click();
  const comets = page.getByRole("region", { name: "Comets" });
  const blazers = page.getByRole("region", { name: "Blazers" });
  await comets.getByRole("button", { name: "Comets +2 points" }).click();
  await page.waitForTimeout(3000);
  await blazers.getByRole("button", { name: "Blazers +3 points" }).click();
  await expect(page.locator("main").getByRole("status").first()).toContainText("All changes saved");

  // Comets' film: add the game, upload the video, link it to the match.
  await page.goto("/teams");
  await page.getByRole("link", { name: "Comets" }).click();
  await page.getByLabel("Game title").fill("vs Blazers");
  await page.getByRole("button", { name: "Add game" }).click();
  await page.getByRole("link", { name: "vs Blazers" }).click();
  await page.getByLabel(/Upload video/).setInputFiles(makeVideo());
  const video = page.getByLabel("Game video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(5);

  const link = page.getByRole("form", { name: "Link a match" });
  await link.getByLabel("Official match").selectOption({ index: 1 });
  await link.getByRole("button", { name: "Link film to match" }).click();
  const lineup = page.getByRole("form", { name: "Line up the video" });
  await expect(lineup).toBeVisible();

  // Our first basket happened 1 second into the video.
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 1; });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(1, 0);
  await lineup.getByLabel("Basket").selectOption({ label: "Q1 · our +2 · 2–0" });
  await lineup.getByRole("button", { name: /Use the current video time/ }).click();

  // Timeline: first basket at ~0:01, the other team's three about 3 s later; clicking it jumps the video there.
  const list = page.getByRole("list", { name: "Scorebook timeline" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").first()).toContainText("our +2");
  await expect(list.getByRole("listitem").last()).toContainText("their +3");
  await expect(list.getByRole("listitem").last()).toContainText("2–3");
  await list.getByRole("listitem").last().getByRole("button").click();
  const t = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t).toBeGreaterThan(3.2); // 1 s + ~3 s between taps (a little more with the browser's click delay)
  expect(t).toBeLessThan(5.5);

  // A second sync point (as if the video had been cut): the other team's three is really at 4.5 s. Events use the nearest point.
  await page.getByText("Add another sync point").click();
  const more = page.getByRole("form", { name: "Add a sync point" });
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 4.5; });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(4.5, 0);
  await more.getByLabel("Basket").selectOption({ label: "Q1 · their +3 · 2–3" });
  await more.getByRole("button", { name: /Use the current video time/ }).click();
  await expect(page.getByRole("list", { name: "Sync points" }).getByRole("listitem")).toHaveCount(2);
  await list.getByRole("listitem").last().getByRole("button").click();
  const t2 = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(Math.abs(t2 - 4.5)).toBeLessThan(0.3); // exactly its own sync point now

  // Removing that point puts it back where the first point places it.
  await page.getByRole("button", { name: /Remove sync point at 0:04/ }).click();
  await expect(page.getByRole("list", { name: "Sync points" }).getByRole("listitem")).toHaveCount(1);
  await list.getByRole("listitem").last().getByRole("button").click();
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(3.2); // back to ~1 s + ~3 s from the first point
});
