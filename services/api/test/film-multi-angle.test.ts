import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U, url: string, payload?: unknown) =>
  t.app.inject({ method: "POST", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });
const get = (t: T, url: string, u?: U, headers?: Record<string, string>) =>
  t.app.inject({ url, headers: { ...(u ? { cookie: u.cookie } : {}), ...(headers ?? {}) } });
const put = (t: T, u: U, url: string, body?: unknown, headers?: Record<string, string>) =>
  t.app.inject({ method: "PUT", url, headers: { cookie: u.cookie, ...(headers ?? {}) }, body: body as string | Buffer });
const patch = (t: T, u: U, url: string, payload?: unknown) =>
  t.app.inject({ method: "PATCH", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });
const del = (t: T, u: U, url: string) =>
  t.app.inject({ method: "DELETE", url, headers: { cookie: u.cookie } });

describe("Multi-Angle Synchronized Game Film Angles & Video Streams (Spec §6.1, §6.3, §18.2)", () => {
  it("enforces negative authZ on angle management and streaming (ADR-0010: RFC 9457 404)", async () => {
    const t = await testApp();
    const coach = await user(t, "coach-film-angles@courtiq.test");
    const outsider = await user(t, "outsider-film@courtiq.test");

    // Coach creates team and game
    const team = (await post(t, coach, "/api/v1/teams", { name: "Varsity Warriors" })).json();
    const game = (await post(t, coach, `/api/v1/teams/${team.id}/games`, { title: "Championship vs Lions" })).json();

    // Outsider tries to list angles -> 404
    const badList = await get(t, `/api/v1/film/games/${game.id}/angles`, outsider);
    expect(badList.statusCode).toBe(404);

    // Outsider tries to create an angle -> 404
    const badCreate = await post(t, outsider, `/api/v1/film/games/${game.id}/angles`, {
      label: "Tactical Cam",
      angleType: "BASELINE",
    });
    expect(badCreate.statusCode).toBe(404);
  });

  it("registers camera angles, streams video with byte-range requests, and maintains time offsets", async () => {
    const t = await testApp();
    const coach = await user(t, "coach-camera-pro@courtiq.test");

    // 1. Create team and game film
    const team = (await post(t, coach, "/api/v1/teams", { name: "Thunder Academy" })).json();
    const game = (await post(t, coach, `/api/v1/teams/${team.id}/games`, {
      title: "Playoffs vs Red Hawks",
      opponent: "Red Hawks",
      playedOn: "2026-10-20",
    })).json();

    // 2. Upload main game video
    const mainVideoData = Buffer.from("MAIN_BROADCAST_VIDEO_DATA_BUFFER_60FPS");
    const uploadMain = await put(
      t,
      coach,
      `/api/v1/film/games/${game.id}/video`,
      mainVideoData,
      { "content-type": "video/mp4", "content-length": String(mainVideoData.length) }
    );
    expect(uploadMain.statusCode).toBe(204);

    // Initial list of angles returns synthesized Main Broadcast angle
    const anglesRes = await get(t, `/api/v1/film/games/${game.id}/angles`, coach);
    const initialAngles = anglesRes.json().items;
    expect(initialAngles).toHaveLength(1);
    expect(initialAngles[0].label).toBe("Main Broadcast");
    expect(initialAngles[0].isPrimary).toBe(true);

    // 3. Register a secondary camera angle: Tactical Baseline (+1200ms offset)
    const baselineRes = await post(t, coach, `/api/v1/film/games/${game.id}/angles`, {
      label: "Tactical Baseline (Low Post)",
      angleType: "BASELINE",
      isPrimary: false,
      timeOffsetMs: 1200,
    });
    expect(baselineRes.statusCode).toBe(201);
    const baselineAngle = baselineRes.json();
    expect(baselineAngle.label).toBe("Tactical Baseline (Low Post)");
    expect(baselineAngle.angleType).toBe("BASELINE");
    expect(baselineAngle.timeOffsetMs).toBe(1200);
    expect(baselineAngle.video.status).toBe("NONE");

    // 4. Register a third camera angle: High End-Zone (-500ms offset)
    const endzoneRes = await post(t, coach, `/api/v1/film/games/${game.id}/angles`, {
      label: "High End-Zone (Spacing)",
      angleType: "ENDZONE",
      isPrimary: false,
      timeOffsetMs: -500,
    });
    expect(endzoneRes.statusCode).toBe(201);
    const endzoneAngle = endzoneRes.json();
    expect(endzoneAngle.angleType).toBe("ENDZONE");

    // 5. Upload video for the baseline angle
    const baselineVideoData = Buffer.from("BASELINE_CAMERA_ANGLE_1080P_HD_RAW_STREAM_DATA");
    const uploadAngleVideo = await put(
      t,
      coach,
      `/api/v1/film/games/${game.id}/angles/${baselineAngle.id}/video`,
      baselineVideoData,
      { "content-type": "video/mp4", "content-length": String(baselineVideoData.length) }
    );
    expect(uploadAngleVideo.statusCode).toBe(204);

    // 6. Verify list of angles contains ready video for baseline angle
    const anglesList = (await get(t, `/api/v1/film/games/${game.id}/angles`, coach)).json().items;
    expect(anglesList).toHaveLength(2); // baseline + endzone registered rows
    const readyAngle = anglesList.find((a: { id: string }) => a.id === baselineAngle.id);
    expect(readyAngle.video.status).toBe("READY");
    expect(readyAngle.video.bytes).toBe(baselineVideoData.length);

    // 7. Verify full stream request (200 OK)
    const fullStream = await get(t, `/api/v1/film/games/${game.id}/angles/${baselineAngle.id}/video`, coach);
    expect(fullStream.statusCode).toBe(200);
    expect(fullStream.headers["content-type"]).toBe("video/mp4");
    expect(fullStream.body).toBe(baselineVideoData.toString());

    // 8. Verify byte-range partial stream request (206 Partial Content)
    const rangeStream = await get(
      t,
      `/api/v1/film/games/${game.id}/angles/${baselineAngle.id}/video`,
      coach,
      { range: "bytes=0-14" }
    );
    expect(rangeStream.statusCode).toBe(206);
    expect(rangeStream.headers["content-range"]).toBe(`bytes 0-14/${baselineVideoData.length}`);
    expect(rangeStream.body).toBe(baselineVideoData.subarray(0, 15).toString());

    // 9. Update angle time offset and label
    const patchRes = await patch(t, coach, `/api/v1/film/games/${game.id}/angles/${baselineAngle.id}`, {
      label: "Tactical Baseline (Calibrated)",
      timeOffsetMs: 1350,
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().label).toBe("Tactical Baseline (Calibrated)");
    expect(patchRes.json().timeOffsetMs).toBe(1350);

    // 10. Delete endzone angle cleanly
    const delRes = await del(t, coach, `/api/v1/film/games/${game.id}/angles/${endzoneAngle.id}`);
    expect(delRes.statusCode).toBe(204);

    // Verify endzone angle is gone
    const updatedAngles = (await get(t, `/api/v1/film/games/${game.id}/angles`, coach)).json().items;
    expect(updatedAngles.find((a: { id: string }) => a.id === endzoneAngle.id)).toBeUndefined();
  });
});
