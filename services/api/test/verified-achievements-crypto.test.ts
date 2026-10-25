import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeAchievementSignature,
  verifyAchievementSignature,
} from "../src/career/achievements.js";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const call = (t: T, u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });

describe("Cryptographic Achievement Signatures & Tamper Protection (Spec §3.1, §11.2)", () => {
  it("computes deterministic HMAC-SHA256 signature and detects data tampering", () => {
    const payload = {
      id: randomUUID(),
      userId: randomUUID(),
      title: "Tournament MVP",
      category: "AWARD",
      issuer: "FIBA World League",
      verifiedAt: new Date().toISOString(),
      evidenceUrl: "https://courtiq.io/matches/m-123/box-score",
      evidenceRef: "match:m-123",
    };

    const signature = computeAchievementSignature(payload);
    expect(signature).toHaveLength(64); // 256-bit hex string

    const row = {
      ...payload,
      verifiedAt: new Date(payload.verifiedAt),
      signature,
      competitionId: null,
      isRevoked: false,
      revokedAt: null,
      revocationReason: null,
      revokedBy: null,
      createdAt: new Date(),
    };

    expect(verifyAchievementSignature(row as never)).toBe(true);

    // Tamper with title: verification must fail
    const tamperedTitle = { ...row, title: "All-Tournament First Team" };
    expect(verifyAchievementSignature(tamperedTitle as never)).toBe(false);

    // Tamper with evidenceUrl: verification must fail
    const tamperedEvidence = { ...row, evidenceUrl: "https://tampered-evidence.com" };
    expect(verifyAchievementSignature(tamperedEvidence as never)).toBe(false);

    // Missing signature returns false
    const missingSig = { ...row, signature: null };
    expect(verifyAchievementSignature(missingSig as never)).toBe(false);
  });
});

describe("Verified Achievements API & Revocation Engine (WP-8.2, Spec §11.2, ADR-0010)", () => {
  it("issues cryptographically signed achievements and provides public verification proof", async () => {
    const t = await testApp();
    const organizer = await user(t, "org@hoops.test");
    const athlete = await user(t, "star@hoops.test", { displayName: "Luka Magic" });

    // 1. Organizer creates a competition
    const compRes = await call(t, organizer, "POST", "/api/v1/competitions", {
      name: "FIBA Continental Cup",
      format: "SINGLE_ELIMINATION",
    });
    const compId = compRes.json().id as string;

    // 2. Issue verified achievement tied to the tournament
    const issueRes = await call(t, organizer, "POST", "/api/v1/achievements", {
      userId: athlete.id,
      competitionId: compId,
      title: "Finals MVP & Scoring Leader",
      category: "AWARD",
      issuer: "FIBA Continental Committee",
      evidenceUrl: "https://courtiq.io/matches/finals-1/box-score",
      evidenceRef: "match:finals-1",
    });
    expect(issueRes.statusCode).toBe(201);
    const achievement = issueRes.json();

    expect(achievement.id).toBeDefined();
    expect(achievement.signature).toHaveLength(64);
    expect(achievement.isRevoked).toBe(false);
    expect(achievement.evidenceUrl).toBe("https://courtiq.io/matches/finals-1/box-score");

    // 3. Public Verification Endpoint (No auth required)
    const verifyRes = await call(t, null, "GET", `/api/v1/achievements/${achievement.id}/verify`);
    expect(verifyRes.statusCode).toBe(200);
    const proof = verifyRes.json();

    expect(proof.achievement.athleteName).toBe("Luka Magic");
    expect(proof.achievement.competitionName).toBe("FIBA Continental Cup");
    expect(proof.verification.isValid).toBe(true);
    expect(proof.verification.algorithm).toBe("HMAC_SHA256");
    expect(proof.verification.isRevoked).toBe(false);

    // 4. Negative AuthZ (ADR-0010): Unknown achievement returns 404
    const unknownRes = await call(t, null, "GET", `/api/v1/achievements/${randomUUID()}/verify`);
    expect(unknownRes.statusCode).toBe(404);

    // 5. Query athlete public achievements list
    const listRes = await call(t, null, "GET", `/api/v1/users/${athlete.id}/achievements`);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items).toHaveLength(1);
    expect(listRes.json().items[0].isValidSignature).toBe(true);

    // 6. Revocation workflow: Organizer revokes achievement with reason
    const revokeRes = await call(t, organizer, "POST", `/api/v1/achievements/${achievement.id}/revoke`, {
      reason: "Disciplinary committee overturned MVP honor due to technical violation",
    });
    expect(revokeRes.statusCode).toBe(200);
    expect(revokeRes.json().isRevoked).toBe(true);
    expect(revokeRes.json().revocationReason).toContain("Disciplinary committee");

    // 7. Verify endpoint now reflects revoked status with reason
    const postRevokeVerify = await call(t, null, "GET", `/api/v1/achievements/${achievement.id}/verify`);
    expect(postRevokeVerify.statusCode).toBe(200);
    expect(postRevokeVerify.json().verification.isRevoked).toBe(true);
    expect(postRevokeVerify.json().verification.revocationReason).toContain("Disciplinary committee");

    // 8. Prevent duplicate revocation (409)
    const duplicateRevoke = await call(t, organizer, "POST", `/api/v1/achievements/${achievement.id}/revoke`, {
      reason: "Another reason",
    });
    expect(duplicateRevoke.statusCode).toBe(409);

    // 9. Standard athlete achievement list excludes revoked achievements by default
    const activeList = await call(t, null, "GET", `/api/v1/users/${athlete.id}/achievements`);
    expect(activeList.json().items).toHaveLength(0);

    // But includes revoked when explicitly requested with includeRevoked=true
    const fullList = await call(t, null, "GET", `/api/v1/users/${athlete.id}/achievements?includeRevoked=true`);
    expect(fullList.json().items).toHaveLength(1);
    expect(fullList.json().items[0].isRevoked).toBe(true);
  });

  it("enforces negative authZ when unauthorized user attempts to issue or revoke an achievement", async () => {
    const t = await testApp();
    const organizer = await user(t, "org-legit@hoops.test");
    const intruder = await user(t, "intruder@hoops.test");
    const athlete = await user(t, "victim@hoops.test");

    const comp = (await call(t, organizer, "POST", "/api/v1/competitions", {
      name: "Secret Invitational",
      format: "ROUND_ROBIN",
    })).json();

    // Intruder attempts to issue achievement under organizer's competition -> 404 (ADR-0010)
    const fakeIssue = await call(t, intruder, "POST", "/api/v1/achievements", {
      userId: athlete.id,
      competitionId: comp.id,
      title: "Bogus Trophy",
      category: "AWARD",
      issuer: "Fake Org",
    });
    expect(fakeIssue.statusCode).toBe(404);

    // Organizer issues real achievement
    const realAch = (await call(t, organizer, "POST", "/api/v1/achievements", {
      userId: athlete.id,
      competitionId: comp.id,
      title: "Real Trophy",
      category: "AWARD",
      issuer: "Official League",
    })).json();

    // Intruder attempts to revoke organizer's achievement -> 404 (ADR-0010)
    const fakeRevoke = await call(t, intruder, "POST", `/api/v1/achievements/${realAch.id}/revoke`, {
      reason: "Malicious revoke attempt",
    });
    expect(fakeRevoke.statusCode).toBe(404);
  });
});
