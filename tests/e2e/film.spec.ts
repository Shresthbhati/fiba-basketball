import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

const run = Date.now().toString(36);

async function signUp(browser: Browser, name: string): Promise<{ page: Page; email: string }> {
  const page = await (await browser.newContext()).newPage();
  const email = `${name.toLowerCase().replace(/\W/g, "")}-${run}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Date of birth").fill("1993-05-06");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);
  return { page, email };
}

function makeVideo(): string {
  const file = join(mkdtempSync(join(tmpdir(), "film-e2e-")), "game.webm");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=4:size=160x120:rate=10", "-c:v", "libvpx", "-b:v", "100k", file]);
  return file;
}

test("film: coach uploads and tags a game; players watch; outsiders get nothing", async ({ browser }) => {
  const coach = (await signUp(browser, "Cora Coach")).page;
  const player = await signUp(browser, "Pia Player");
  const outsider = (await signUp(browser, "Otto Outsider")).page;

  // Coach creates a team, adds the player, adds a game and uploads real video.
  await coach.goto("/teams");
  await coach.getByLabel("Team name").fill(`Hawks ${run}`);
  await coach.getByRole("button", { name: "Create team" }).click();
  await coach.getByRole("link", { name: `Hawks ${run}` }).click();
  await expect(coach.getByRole("form", { name: "Add a member" })).toBeVisible();
  await coach.getByLabel(/Email of an existing account/).fill(player.email);
  await coach.getByRole("button", { name: "Add to team" }).click();
  await expect(coach.getByText("Pia Player · Player")).toBeVisible();
  await coach.getByLabel("Game title").fill("vs Lions");
  await coach.getByRole("button", { name: "Add game" }).click();
  await coach.getByRole("link", { name: "vs Lions" }).click();
  await expect(coach).toHaveURL(/\/film\/[0-9a-f-]{36}$/);
  const filmUrl = coach.url();
  await expect(coach.getByText("No video uploaded yet.")).toBeVisible();

  await coach.getByLabel(/Upload video/).setInputFiles(makeVideo());
  const video = coach.getByLabel("Game video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(3);

  // Mark a clip from 1s to 3s and save it with tags.
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 1; });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(1, 0);
  await coach.getByRole("button", { name: "Mark start" }).click();
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 3; });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(3, 0);
  await coach.getByRole("button", { name: "Mark end" }).click();
  await coach.getByLabel(/^Tags/).fill("Fast Break, turnover");
  await coach.getByLabel(/^Note/).fill("Great outlet pass");
  await coach.getByRole("button", { name: "Save clip" }).click();
  await expect(coach.getByText("Great outlet pass")).toBeVisible();
  await expect(coach.getByText("#fast break")).toBeVisible();

  // Player sees the video and clip, can filter, and has no management controls.
  await player.page.goto(filmUrl);
  await expect(player.page.getByLabel("Game video")).toBeVisible();
  await expect(player.page.getByText("Great outlet pass")).toBeVisible();
  await expect(player.page.getByLabel(/Upload video|Replace video/)).toHaveCount(0);
  await expect(player.page.getByRole("button", { name: "Mark start" })).toHaveCount(0);
  await player.page.getByLabel("Filter by tag").fill("nothing");
  await expect(player.page.getByText("No clips with that tag.")).toBeVisible();
  await player.page.getByLabel("Filter by tag").fill("turnover");
  await expect(player.page.getByText("Great outlet pass")).toBeVisible();

  // Range requests work for members (this is what makes seeking possible).
  const gameId = filmUrl.split("/").pop()!;
  const ranged = await player.page.request.get(`/api/v1/film/games/${gameId}/video`, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(100);

  // An outsider sees "not found" in the page and 404 from the API for the game, clips and video.
  await outsider.goto(filmUrl);
  await expect(outsider.getByText(/could not find that game/)).toBeVisible();
  for (const path of ["", "/video", "/clips"]) {
    expect((await outsider.request.get(`/api/v1/film/games/${gameId}${path}`)).status()).toBe(404);
  }
  expect((await outsider.request.put(`/api/v1/film/games/${gameId}/video`, { headers: { "content-type": "video/mp4" }, data: Buffer.from("x") })).status()).toBe(404);

  // Removing the player ends their access immediately.
  await coach.goto(`/teams/${(await coach.request.get("/api/v1/me/teams").then((r) => r.json())).items[0].id}`);
  await coach.getByRole("button", { name: "Remove Pia Player" }).click();
  await expect(coach.getByText("Pia Player · Player")).toHaveCount(0);
  expect((await player.page.request.get(`/api/v1/film/games/${gameId}/video`)).status()).toBe(404);
});
