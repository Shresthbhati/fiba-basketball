import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainHistory } from "../lib/train-history";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const squat = { id: "e1", slug: "back-squat", name: "Back squat", category: "STRENGTH", equipment: [], cues: "", safetyNotes: "", reviewed: false };
function mock(history: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/exercises")) return Response.json({ items: [squat] });
    if (url.includes("/training/history/")) return Response.json(history, { status });
    if (url.includes("/training/progression/")) return Response.json({ action: "HOLD", explanation: "Keep working.", basedOnSessions: 1 });
    return Response.json({});
  }));
}

describe("TrainHistory", () => {
  it("shows the sample size every time and warns that few workouts say little", async () => {
    mock({ sampleSize: 2, items: [{ sessionId: "a", date: "2030-01-02T10:00:00Z", sets: 3, topLoadKg: 62.5, repsAtTopLoad: [8, 7] }, { sessionId: "b", date: "2030-01-01T10:00:00Z", sets: 2, topLoadKg: null, repsAtTopLoad: [12] }] });
    render(<TrainHistory />);
    expect((await screen.findByRole("status")).textContent).toMatch(/Based on 2 workouts.*Early days/);
    expect(screen.getByText("62.5")).toBeTruthy();
    expect(screen.getByText("8, 7")).toBeTruthy();
    expect(screen.getByText("bodyweight")).toBeTruthy();
    expect((await screen.findByLabelText("Suggestion")).textContent).toMatch(/Keep working/);
  });
  it("says so when there is nothing logged, and asks you to log in when signed out", async () => {
    mock({ sampleSize: 0, items: [] });
    render(<TrainHistory />);
    expect(await screen.findByText(/haven't logged this exercise yet/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Based on 0 workouts/);
    cleanup();
    mock({ title: "Not signed in" }, 401);
    render(<TrainHistory />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Log in/);
  });
});
