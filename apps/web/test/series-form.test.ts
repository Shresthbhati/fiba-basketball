import { describe, expect, it } from "vitest";
import { seriesBody } from "../lib/series-form";

const base = { courtId: "c1", title: "Run", capacity: 10, startsAtLocal: "2027-03-14T18:00", endsAtLocal: "2027-03-14T20:30" };

describe("seriesBody", () => {
  it("derives weekday, local start time and duration from the form's local times", () => {
    expect(seriesBody(base, "America/New_York")).toEqual({
      courtId: "c1", title: "Run", capacity: 10, weekday: 0, startTime: "18:00", durationMin: 150, timezone: "America/New_York",
    });
    expect(seriesBody({ ...base, startsAtLocal: "2027-03-17T07:05", endsAtLocal: "2027-03-17T08:05", skillBand: "CASUAL" }, "UTC"))
      .toMatchObject({ weekday: 3, startTime: "07:05", durationMin: 60, skillBand: "CASUAL" });
  });
  it("omits an empty skill band and handles an end after midnight", () => {
    const b = seriesBody({ ...base, skillBand: "", startsAtLocal: "2027-03-19T23:00", endsAtLocal: "2027-03-20T01:00" }, "UTC");
    expect(b).not.toHaveProperty("skillBand");
    expect(b).toMatchObject({ weekday: 5, durationMin: 120 });
  });
});
