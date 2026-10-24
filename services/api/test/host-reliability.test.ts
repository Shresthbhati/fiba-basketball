import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U | null, url: string, payload?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
    ...(payload ? { payload: payload as object } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Host Reliability Signals & Attendance Feedback (WP-5.3)", { timeout: 30000 }, () => {
  it("submits post-run reviews, rejects non-participants, and computes host reliability score", async () => {
    const t = await testApp();
    const host = await user(t, "host-reliable@courtiq.test", { displayName: "Coach Steve" });
    const player = await user(t, "player-reviewer@courtiq.test");
    const stranger = await user(t, "stranger-review@courtiq.test");

    // 1. Create a court and a pickup game
    const courtRes = await post(t, host, "/api/v1/courts", {
      name: "Green Lake Community Court",
      lat: 47.68,
      lng: -122.33,
      indoor: true,
      surface: "WOOD",
      hoops: 2,
      lit: true,
    });
    const courtId = courtRes.json().id;

    const gameRes = await post(t, host, "/api/v1/pickup", {
      courtId,
      title: "Saturday Morning 5v5 Run",
      startsAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      endsAt: new Date(Date.now() + 7200000).toISOString(),
      capacity: 10,
    });
    expect(gameRes.statusCode).toBe(201);
    const gameId = gameRes.json().id;

    // 2. Player joins game as confirmed participant
    const rsvpRes = await post(t, player, `/api/v1/pickup/${gameId}/rsvp`);
    expect(rsvpRes.statusCode).toBe(200);

    // 3. Host attempts to review own game -> 400 Bad Request
    const hostSelfReview = await post(t, host, `/api/v1/pickup/${gameId}/reviews`, {
      runHappened: true,
      rating: 5,
    });
    expect(hostSelfReview.statusCode).toBe(400);

    // 4. Stranger (non-participant) attempts to review -> 403 Forbidden
    const strangerReview = await post(t, stranger, `/api/v1/pickup/${gameId}/reviews`, {
      runHappened: true,
      rating: 1,
    });
    expect(strangerReview.statusCode).toBe(403);

    // 5. Confirmed player submits valid post-run review -> 201
    const reviewRes = await post(t, player, `/api/v1/pickup/${gameId}/reviews`, {
      runHappened: true,
      rating: 5,
      punctuality: "ON_TIME",
      competitionMatched: true,
      feedbackNotes: "Great run! Well organized, full 5v5 with subs.",
    });
    expect(reviewRes.statusCode).toBe(201);
    expect(reviewRes.json().rating).toBe(5);

    // 6. Duplicate review check -> 409 Conflict
    const dupRes = await post(t, player, `/api/v1/pickup/games/${gameId}/reviews`, {
      runHappened: true,
      rating: 5,
    });
    expect(dupRes.statusCode).toBe(409);

    // 7. Get Host Reliability Metrics
    const metricsRes = await get(t, null, `/api/v1/hosts/${host.id}/reliability`);
    expect(metricsRes.statusCode).toBe(200);
    const metrics = metricsRes.json();

    expect(metrics.hostName).toBe("Coach Steve");
    expect(metrics.totalGamesHosted).toBe(1);
    expect(metrics.reviewsCount).toBe(1);
    expect(metrics.averageRating).toBe(5);
    expect(metrics.runConfirmationPercent).toBe(100);
    expect(metrics.onTimePercent).toBe(100);
    expect(metrics.reliabilityScore).toBeGreaterThanOrEqual(80);

    // 8. List public reviews for host
    const listRes = await get(t, null, `/api/v1/hosts/${host.id}/reviews`);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items.length).toBe(1);
    expect(listRes.json().items[0].feedbackNotes).toContain("Great run!");
  });
});
