import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WellnessCard } from "../lib/wellness-card";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const PAIN = "You reported pain. Training suggestions are paused. Please consider speaking to a qualified professional before continuing.";
const status = (over = {}) => ({ latest: null, trainingPaused: false, message: null, ...over });

describe("WellnessCard", () => {
  it("is optional and private, and shows nothing alarming by default", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(status())));
    render(<WellnessCard />);
    expect(await screen.findByText("Check in")).toBeTruthy();
    expect(screen.getByText(/Optional and private/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the pause message already on load when pain was reported recently", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(status({ trainingPaused: true, message: PAIN, latest: { date: "2030-01-01", fatigue: null, soreness: null, sleepHours: null, painReported: true, painNote: null } }))));
    render(<WellnessCard />);
    expect((await screen.findByRole("alert")).textContent).toBe(PAIN);
  });

  it("saving a pain report sends it and shows the pause message; the note is only sent with pain", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") { bodies.push(JSON.parse(init.body!)); return Response.json(status({ trainingPaused: true, message: PAIN })); }
      return Response.json(status());
    }));
    render(<WellnessCard />);
    fireEvent.click(await screen.findByText("Check in"));
    fireEvent.click(screen.getByLabelText(/I have pain or something feels unstable/));
    fireEvent.change(screen.getByLabelText(/What are you feeling/), { target: { value: "left knee" } });
    fireEvent.click(screen.getByText("Save check-in"));
    expect((await screen.findByRole("alert")).textContent).toBe(PAIN);
    expect(bodies[0]).toEqual({ painReported: true, painNote: "left knee" });
    expect(screen.queryByText("Save check-in")).toBeNull(); // form closed
  });
});
