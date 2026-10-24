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

const patch = (t: T, u: U | null, url: string, payload?: unknown) =>
  t.app.inject({
    method: "PATCH",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
    ...(payload ? { payload: payload as object } : {}),
  });

const del = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "DELETE",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Scout Workspace & Talent Discovery (WP-8.4)", { timeout: 30000 }, () => {
  it("manages scout profile and empirical talent search adhering to minor safeguards", async () => {
    const t = await testApp();
    const scout = await user(t, "scout-1@courtiq.test");
    const minorAthlete = await user(t, "scout-minor@courtiq.test", {
      displayName: "Young Prospect",
      dateOfBirth: "2010-01-01",
    });
    const adultAthlete = await user(t, "scout-adult@courtiq.test", {
      displayName: "Marcus King",
      dateOfBirth: "2000-05-12",
    });

    // 1. Create/update scout profile
    const profileRes = await post(t, scout, "/api/v1/scout/profile", {
      organization: "Pacific Northwest Scouting Service",
      roleTitle: "Regional Director of Scouting",
      notes: "Evaluating collegiate and professional prospects.",
    });
    expect(profileRes.statusCode).toBe(200);
    expect(profileRes.json().organization).toBe("Pacific Northwest Scouting Service");

    // 2. Fetch profile
    const getProf = await get(t, scout, "/api/v1/scout/profile");
    expect(getProf.statusCode).toBe(200);
    expect(getProf.json().profile.roleTitle).toBe("Regional Director of Scouting");

    // 3. Search talent pool: Minors are strictly excluded by default (Spec §11.2, §14.1)
    const searchRes = await get(t, scout, "/api/v1/scout/talent-search");
    expect(searchRes.statusCode).toBe(200);
    const athletes = searchRes.json().items;

    // Adult prospect is found
    expect(athletes.some((a: { athleteId: string }) => a.athleteId === adultAthlete.id)).toBe(true);

    // Minor prospect is NEVER included in public scout search
    expect(athletes.some((a: { athleteId: string }) => a.athleteId === minorAthlete.id)).toBe(false);

    // Verify ADR-0008 provenance notice is attached
    const candidate = athletes.find((a: { athleteId: string }) => a.athleteId === adultAthlete.id);
    expect(candidate.stats.provenance).toBe("OFFICIAL");
    expect(candidate.provenanceNotice).toContain("Pure empirical data per ADR-0008");
  });

  it("creates shortlists, manages members, and enforces negative authZ on private lists", async () => {
    const t = await testApp();
    const scoutA = await user(t, "scout-a@courtiq.test");
    const scoutB = await user(t, "scout-b@courtiq.test");
    const athlete = await user(t, "candidate-a@courtiq.test", { displayName: "Jordan Smith" });

    // 1. Scout A creates a shortlist
    const listRes = await post(t, scoutA, "/api/v1/scout/shortlists", {
      name: "2026 Point Guard Watchlist",
      description: "Elite ballhandlers with high assist-to-turnover ratios.",
      isSharedWithOrg: false,
    });
    expect(listRes.statusCode).toBe(201);
    const listId = listRes.json().id;

    // 2. Scout A adds athlete to shortlist
    const addRes = await post(t, scoutA, `/api/v1/scout/shortlists/${listId}/members`, {
      athleteId: athlete.id,
      evaluationTier: "HIGH_PRIORITY",
      scoutNotes: "Excellent pick-and-roll vision and change of pace.",
    });
    expect(addRes.statusCode).toBe(201);
    const memberId = addRes.json().id;

    // 3. Scout A views their shortlist
    const getRes = await get(t, scoutA, `/api/v1/scout/shortlists/${listId}`);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().members.length).toBe(1);
    expect(getRes.json().members[0].athleteName).toBe("Jordan Smith");

    // 4. Negative AuthZ: Scout B tries to access Scout A's private shortlist -> 404 (ADR-0010)
    const unauthorizedGet = await get(t, scoutB, `/api/v1/scout/shortlists/${listId}`);
    expect(unauthorizedGet.statusCode).toBe(404);

    // 5. Negative AuthZ: Scout B tries to delete member from Scout A's list -> 404
    const unauthorizedDel = await del(
      t,
      scoutB,
      `/api/v1/scout/shortlists/${listId}/members/${memberId}`,
    );
    expect(unauthorizedDel.statusCode).toBe(404);

    // 6. Scout A updates member tier
    const patchRes = await patch(
      t,
      scoutA,
      `/api/v1/scout/shortlists/${listId}/members/${memberId}`,
      {
        evaluationTier: "CONTACTED",
        scoutNotes: "Spoke with coach. Verified work ethic and combine metrics.",
      },
    );
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().evaluationTier).toBe("CONTACTED");

    // 7. Scout A removes member
    const delRes = await del(
      t,
      scoutA,
      `/api/v1/scout/shortlists/${listId}/members/${memberId}`,
    );
    expect(delRes.statusCode).toBe(204);

    const emptyRes = await get(t, scoutA, `/api/v1/scout/shortlists/${listId}`);
    expect(emptyRes.json().members.length).toBe(0);
  });
});
