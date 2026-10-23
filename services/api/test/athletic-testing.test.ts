import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";
import {
  calculateAthleticSignature,
  calculatePercentile,
} from "../src/training/normative-benchmarks.js";
import { roleAssignments, teams } from "../src/db/schema.js";

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

describe("normative benchmarks pure calculation", () => {
  it("interpolates percentiles accurately for higher-is-better metrics (Standing Vertical Jump)", () => {
    // Collegiate male: p10: 55, p25: 62, p50: 71, p75: 78, p90: 86, p99: 98
    expect(calculatePercentile(71, "standing-vertical-jump", "COLLEGIATE_MALE")).toBe(50);
    expect(calculatePercentile(98, "standing-vertical-jump", "COLLEGIATE_MALE")).toBe(99);
    expect(calculatePercentile(105, "standing-vertical-jump", "COLLEGIATE_MALE")).toBe(99);
    expect(calculatePercentile(55, "standing-vertical-jump", "COLLEGIATE_MALE")).toBe(10);
    expect(calculatePercentile(74.5, "standing-vertical-jump", "COLLEGIATE_MALE")).toBe(63);
  });

  it("interpolates percentiles accurately for lower-is-better metrics (3/4 Court Sprint)", () => {
    // Collegiate male: p10: 3.52, p25: 3.40, p50: 3.28, p75: 3.18, p90: 3.08, p99: 2.95
    expect(calculatePercentile(3.28, "three-quarter-court-sprint", "COLLEGIATE_MALE")).toBe(50);
    expect(calculatePercentile(2.95, "three-quarter-court-sprint", "COLLEGIATE_MALE")).toBe(99);
    expect(calculatePercentile(2.85, "three-quarter-court-sprint", "COLLEGIATE_MALE")).toBe(99);
    expect(calculatePercentile(3.52, "three-quarter-court-sprint", "COLLEGIATE_MALE")).toBe(10);
    // 3.23 is halfway between p50 (3.28) and p75 (3.18) -> ~63rd percentile
    expect(calculatePercentile(3.23, "three-quarter-court-sprint", "COLLEGIATE_MALE")).toBe(63);
  });

  it("calculates multi-dimensional athletic signature", () => {
    const results = {
      "standing-vertical-jump": 71, // 50th percentile
      "max-vertical-jump": 84, // 50th percentile
      "three-quarter-court-sprint": 3.18, // 75th percentile
      "lane-agility-drill": 10.50, // 75th percentile
      "pro-agility-shuttle": 4.18, // 75th percentile
      "yoyo-intermittent-recovery-1": 17.8, // 50th percentile
    };

    const signature = calculateAthleticSignature(results, "COLLEGIATE_MALE");
    expect(signature.powerPercentile).toBe(50);
    expect(signature.speedPercentile).toBe(75);
    expect(signature.agilityPercentile).toBe(75);
    expect(signature.conditioningPercentile).toBe(50);
    expect(signature.combineIndex).toBe(63);
    expect(signature.testsCompleted).toBe(6);
  });
});

describe("athletic testing API", () => {
  it("exposes public combine protocols and normative benchmark anchors", async () => {
    const t = await testApp();

    const protoRes = await get(t, null, "/api/v1/athletic-testing/protocols");
    expect(protoRes.statusCode).toBe(200);
    const protocols = protoRes.json().items;
    expect(protocols.length).toBe(6);
    expect(protocols.some((p: { slug: string }) => p.slug === "standing-vertical-jump")).toBe(true);
    expect(protocols.some((p: { slug: string }) => p.slug === "three-quarter-court-sprint")).toBe(true);
    expect(protocols.some((p: { slug: string }) => p.slug === "lane-agility-drill")).toBe(true);

    const benchRes = await get(t, null, "/api/v1/athletic-testing/benchmarks?cohort=COLLEGIATE_MALE");
    expect(benchRes.statusCode).toBe(200);
    const benchmarks = benchRes.json().items;
    expect(benchmarks.length).toBe(6);
    const sprintBench = benchmarks.find((b: { slug: string }) => b.slug === "three-quarter-court-sprint");
    expect(sprintBench.anchors.p50).toBe(3.28);
  });

  it("allows athlete to record sessions, log attempts with instrument metadata, and computes best scores", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete1@courtiq.test");

    // Fetch protocols to get IDs
    const protoRes = await get(t, null, "/api/v1/athletic-testing/protocols");
    const protocols = protoRes.json().items;
    const vertProto = protocols.find((p: { slug: string }) => p.slug === "standing-vertical-jump");
    const sprintProto = protocols.find((p: { slug: string }) => p.slug === "three-quarter-court-sprint");

    // Create session
    const sessRes = await post(t, athlete, "/api/v1/athletic-testing/sessions", {
      testDate: "2026-10-24",
      location: "FIBA Center Court",
      surface: "HARDWOOD",
      environmentalNotes: "21°C indoor humidity 45%",
      notes: "Pre-season combine baseline testing",
    });
    expect(sessRes.statusCode).toBe(201);
    const session = sessRes.json();
    expect(session.id).toBeDefined();
    expect(session.surface).toBe("HARDWOOD");

    // Attempt 1: 68 cm
    const att1 = await post(t, athlete, `/api/v1/athletic-testing/sessions/${session.id}/attempts`, {
      protocolId: vertProto.id,
      rawValue: 68.0,
      instrumentType: "VERTEC_VANES",
      instrumentDetails: { model: "Sports Imports Vertec Vane" },
      sourceType: "SELF_REPORTED",
    });
    expect(att1.statusCode).toBe(201);
    expect(att1.json().attemptNumber).toBe(1);

    // Attempt 2: Fault (slipped on plant)
    const att2 = await post(t, athlete, `/api/v1/athletic-testing/sessions/${session.id}/attempts`, {
      protocolId: vertProto.id,
      rawValue: 50.0,
      isFault: true,
      faultReason: "Slipped on countermovement plant",
      instrumentType: "VERTEC_VANES",
    });
    expect(att2.statusCode).toBe(201);
    expect(att2.json().attemptNumber).toBe(2);

    // Attempt 3: 74 cm (New Best)
    const att3 = await post(t, athlete, `/api/v1/athletic-testing/sessions/${session.id}/attempts`, {
      protocolId: vertProto.id,
      rawValue: 74.0,
      instrumentType: "VERTEC_VANES",
    });
    expect(att3.statusCode).toBe(201);
    expect(att3.json().attemptNumber).toBe(3);

    // Sprint Attempt 1: 3.25 seconds with dual beam gates
    const sprintAtt1 = await post(t, athlete, `/api/v1/athletic-testing/sessions/${session.id}/attempts`, {
      protocolId: sprintProto.id,
      rawValue: 3.25,
      instrumentType: "TIMING_GATES_DUAL_BEAM",
      instrumentDetails: { model: "Brower TC-i", beamHeightCm: 90, calibrationDate: "2026-09-01" },
      sourceType: "OFFICIAL",
    });
    expect(sprintAtt1.statusCode).toBe(201);

    // Fetch session details
    const detailRes = await get(t, athlete, `/api/v1/athletic-testing/sessions/${session.id}?cohort=COLLEGIATE_MALE`);
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json();
    expect(detail.attempts.length).toBe(4);

    // Check best scores (fault attempt 50cm was excluded, best is 74cm)
    const vertBest = detail.bestScores["standing-vertical-jump"];
    expect(vertBest).toBeDefined();
    expect(vertBest.rawValue).toBe(74);
    expect(vertBest.percentile).toBeGreaterThan(50); // 71 is 50th, 74 is ~62nd

    const sprintBest = detail.bestScores["three-quarter-court-sprint"];
    expect(sprintBest).toBeDefined();
    expect(sprintBest.rawValue).toBe(3.25);
    expect(sprintBest.percentile).toBeGreaterThan(50); // 3.28 is 50th, 3.25 is faster -> >50

    // Check athlete aggregate profile
    const profileRes = await get(t, athlete, `/api/v1/athletic-testing/athletes/${athlete.id}/profile?cohort=COLLEGIATE_MALE`);
    expect(profileRes.statusCode).toBe(200);
    const profile = profileRes.json();
    expect(profile.athlete.id).toBe(athlete.id);
    expect(profile.personalBests.length).toBe(2);
    expect(profile.signature.powerPercentile).toBeDefined();
    expect(profile.signature.speedPercentile).toBeDefined();
    expect(profile.signature.combineIndex).toBeDefined();
  });

  it("enforces negative authorization (RFC 9457 404) for unauthorized users", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete2@courtiq.test");
    const stranger = await user(t, "stranger@courtiq.test");

    const sessRes = await post(t, athlete, "/api/v1/athletic-testing/sessions", {
      testDate: "2026-10-24",
    });
    const sessionId = sessRes.json().id;

    // Stranger tries to get athlete's session -> 404
    const getRes = await get(t, stranger, `/api/v1/athletic-testing/sessions/${sessionId}`);
    expect(getRes.statusCode).toBe(404);

    // Stranger tries to list athlete's sessions -> 404
    const listRes = await get(t, stranger, `/api/v1/athletic-testing/sessions?userId=${athlete.id}`);
    expect(listRes.statusCode).toBe(404);

    // Stranger tries to get athlete's combine profile -> 404
    const profRes = await get(t, stranger, `/api/v1/athletic-testing/athletes/${athlete.id}/profile`);
    expect(profRes.statusCode).toBe(404);
  });

  it("permits team coaches to record and inspect athlete combine testing", async () => {
    const t = await testApp();
    const coachUser = await user(t, "coach1@courtiq.test");
    const squadPlayer = await user(t, "player1@courtiq.test");

    // Coach creates a team
    const [team] = await t.db
      .insert(teams)
      .values({
        name: "Metro Ballers",
        createdBy: coachUser.id,
      })
      .returning();

    // Assign player to team
    await t.db.insert(roleAssignments).values({
      userId: squadPlayer.id,
      resourceType: "team",
      resourceId: team!.id,
      role: "PLAYER",
    });

    // Fetch protocol
    const protoRes = await get(t, null, "/api/v1/athletic-testing/protocols");
    const vertProto = protoRes.json().items.find((p: { slug: string }) => p.slug === "standing-vertical-jump");

    // Coach creates session on behalf of squad player
    const sessRes = await post(t, coachUser, "/api/v1/athletic-testing/sessions", {
      targetUserId: squadPlayer.id,
      teamId: team!.id,
      testDate: "2026-10-24",
      notes: "Coach-administered combine testing",
    });
    expect(sessRes.statusCode).toBe(201);
    const session = sessRes.json();
    expect(session.userId).toBe(squadPlayer.id);
    expect(session.conductedByUserId).toBe(coachUser.id);

    // Coach records attempt for athlete
    const attRes = await post(t, coachUser, `/api/v1/athletic-testing/sessions/${session.id}/attempts`, {
      protocolId: vertProto.id,
      rawValue: 76.0,
      instrumentType: "VERTEC_VANES",
      sourceType: "COACH",
    });
    expect(attRes.statusCode).toBe(201);

    // Coach can inspect athlete profile
    const profRes = await get(t, coachUser, `/api/v1/athletic-testing/athletes/${squadPlayer.id}/profile`);
    expect(profRes.statusCode).toBe(200);
    expect(profRes.json().personalBests[0].bestValue).toBe(76.0);
    expect(profRes.json().personalBests[0].sourceType).toBe("COACH");
  });
});
