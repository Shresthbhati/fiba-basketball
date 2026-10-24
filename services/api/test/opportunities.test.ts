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

describe("Opportunity Directory & Tryouts Board (WP-8.3)", { timeout: 30000 }, () => {
  it("creates and browses public opportunities with filters", async () => {
    const t = await testApp();
    const organizer = await user(t, "coach-organizer@courtiq.test");
    const athlete = await user(t, "athlete-opp@courtiq.test");

    // 1. Create a Tryout opportunity
    const createRes = await post(t, organizer, "/api/v1/opportunities", {
      title: "Seattle Metro U18 Varsity Tryouts",
      type: "TEAM_TRYOUT",
      organizationName: "Pacific Northwest Basketball Academy",
      description: "Annual varsity squad tryouts for the upcoming regional season.",
      requirements: "Bring reversible jersey, indoor shoes, and proof of age.",
      locationName: "Seattle Community Fieldhouse",
      address: "100 Broadway East",
      city: "Seattle",
      country: "USA",
      costCents: 2500, // $25.00
      currency: "USD",
      contactEmail: "tryouts@pnwbasketball.org",
      ageGroup: "U18",
      minAge: 15,
      maxAge: 18,
      gender: "MEN",
      positions: ["PG", "SG", "SF"],
      skillLevel: "ADVANCED",
      capacity: 40,
    });

    expect(createRes.statusCode).toBe(201);
    const opp = createRes.json();
    expect(opp.id).toBeDefined();
    expect(opp.title).toBe("Seattle Metro U18 Varsity Tryouts");
    expect(opp.verificationStatus).toBe("COMMUNITY");
    expect(opp.type).toBe("TEAM_TRYOUT");

    // 2. Public unauthenticated user can browse opportunities
    const listRes = await get(t, null, "/api/v1/opportunities?city=Seattle");
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json().items;
    expect(list.some((o: { id: string }) => o.id === opp.id)).toBe(true);

    // 3. Filter by type
    const campFilter = await get(t, null, "/api/v1/opportunities?type=SHOWCASE_CAMP");
    expect(campFilter.statusCode).toBe(200);
    expect(campFilter.json().items.some((o: { id: string }) => o.id === opp.id)).toBe(false);

    // 4. Get by ID
    const detailRes = await get(t, athlete, `/api/v1/opportunities/${opp.id}`);
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().applicationCount).toBe(0);
  });

  it("submits applications, enforces minor guardian consent, and allows organizer review", async () => {
    const t = await testApp();
    const organizer = await user(t, "organizer-2@courtiq.test");
    const minorAthlete = await user(t, "minor-tryout@courtiq.test", {
      dateOfBirth: "2010-06-15", // Minor < 18
    });
    const adultAthlete = await user(t, "adult-tryout@courtiq.test", {
      dateOfBirth: "2000-01-01",
    });
    const stranger = await user(t, "stranger@courtiq.test");

    const oppRes = await post(t, organizer, "/api/v1/opportunities", {
      title: "State Showcase Camp",
      type: "SHOWCASE_CAMP",
      organizationName: "State Elite Hoops",
      description: "College prospect showcase camp.",
      locationName: "Downtown Arena",
      city: "Portland",
      contactEmail: "camp@statehoops.org",
    });
    const oppId = oppRes.json().id;

    // 1. Minor tries to apply WITHOUT guardian consent -> Rejected (400) per Spec §11.2, §14.1
    const minorFailRes = await post(t, minorAthlete, `/api/v1/opportunities/${oppId}/apply`, {
      primaryPosition: "PG",
      notes: "Eager to showcase handles and playmaking.",
      guardianConsentGranted: false,
    });
    expect(minorFailRes.statusCode).toBe(400);

    // 2. Minor applies WITH valid guardian consent -> 201
    const minorOkRes = await post(t, minorAthlete, `/api/v1/opportunities/${oppId}/apply`, {
      primaryPosition: "PG",
      heightCm: 185,
      weightKg: 78,
      graduationYear: 2028,
      notes: "Eager to showcase handles and playmaking.",
      guardianConsentGranted: true,
      guardianName: "Jane Doe",
      guardianEmail: "jane.doe@example.com",
    });
    expect(minorOkRes.statusCode).toBe(201);
    const minorAppId = minorOkRes.json().id;

    // 3. Duplicate application check -> 409 Conflict
    const dupRes = await post(t, minorAthlete, `/api/v1/opportunities/${oppId}/apply`, {
      guardianConsentGranted: true,
      guardianName: "Jane Doe",
      guardianEmail: "jane.doe@example.com",
    });
    expect(dupRes.statusCode).toBe(409);

    // 4. Adult athlete applies -> 201
    const adultOkRes = await post(t, adultAthlete, `/api/v1/opportunities/${oppId}/apply`, {
      primaryPosition: "SF",
      heightCm: 198,
      notes: "Wing shooter with transition athleticism.",
    });
    expect(adultOkRes.statusCode).toBe(201);

    // 5. Negative AuthZ: Stranger tries to view applications -> 404 Not Found (ADR-0010)
    const strangerRes = await get(t, stranger, `/api/v1/opportunities/${oppId}/applications`);
    expect(strangerRes.statusCode).toBe(404);

    // 6. Organizer views applications -> 200 with 2 applicants
    const appsRes = await get(t, organizer, `/api/v1/opportunities/${oppId}/applications`);
    expect(appsRes.statusCode).toBe(200);
    const apps = appsRes.json().items;
    expect(apps.length).toBe(2);

    // 7. Organizer updates status to INVITED
    const patchRes = await patch(
      t,
      organizer,
      `/api/v1/opportunities/${oppId}/applications/${minorAppId}`,
      {
        status: "INVITED",
        reviewerNotes: "Impressive film clips. Invited to Top 40 game.",
      },
    );
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().status).toBe("INVITED");

    // 8. Athlete checks their own applications
    const myAppsRes = await get(t, minorAthlete, "/api/v1/me/opportunity-applications");
    expect(myAppsRes.statusCode).toBe(200);
    const myApps = myAppsRes.json().items;
    expect(myApps.length).toBe(1);
    expect(myApps[0].status).toBe("INVITED");
    expect(myApps[0].opportunity.title).toBe("State Showcase Camp");
  });
});
