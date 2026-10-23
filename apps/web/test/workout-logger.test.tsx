import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../lib/api";
import { SetQueue, type SetStore } from "../lib/set-queue";
import { WorkoutLogger } from "../lib/workout-logger";
import type { Exercise, SessionDetail, Suggestion } from "../lib/train-types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const squat: Exercise = { id: "e1", slug: "back-squat", name: "Back squat", category: "STRENGTH", equipment: [], cues: "Brace your trunk.", safetyNotes: "Use a spotter.", reviewed: false };
const jump: Exercise = { id: "e2", slug: "box-jump", name: "Box jump", category: "POWER", equipment: [], cues: "Land softly.", safetyNotes: "Step down.", reviewed: false };
const base: SessionDetail = { id: "s1", startedAt: "2030-01-01T10:00:00Z", endedAt: null, notes: null, sessionRpe: null, sets: [] };

let session: SessionDetail;
let suggestion: Suggestion;
let calls: { key: string; body?: unknown }[];
function mockApi(extra: Record<string, () => Response> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/v1", "")}`;
    calls.push({ key, ...(init?.body ? { body: JSON.parse(init.body) } : {}) });
    if (extra[key]) return extra[key]!();
    if (key === "GET /exercises") return Response.json({ items: [squat, jump] });
    if (key === "GET /training/sessions/s1") return Response.json(session);
    if (key.startsWith("GET /training/progression/")) return Response.json(suggestion);
    return Response.json({}, { status: 201 });
  }));
}
const memStore = (): SetStore => { const d = new Map<string, never>(); return { load: (k) => d.get(k) ?? null, save: (k, v) => void d.set(k, v as never) }; };
const queueFor = (post: ConstructorParameters<typeof SetQueue>[1]) => new SetQueue("s1", post, memStore());

beforeEach(() => { session = { ...base }; suggestion = { action: "INSUFFICIENT_DATA", explanation: "Log at least 2 workouts with this exercise before getting a suggestion (you have 0).", basedOnSessions: 0 }; calls = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("WorkoutLogger", () => {
  it("lists exercises by category, shows cues, the 'awaiting review' label and the suggestion", async () => {
    mockApi();
    render(<WorkoutLogger sessionId="s1" queue={queueFor(async () => undefined)} />);
    expect(await screen.findByLabelText("Log a set")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Back squat" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Box jump" })).toBeTruthy();
    expect(screen.getByText("Brace your trunk.")).toBeTruthy();
    expect(screen.getByText(/Awaiting expert review/)).toBeTruthy();
    expect(await screen.findByText(/Log at least 2 workouts/)).toBeTruthy();
  });

  it("adds a set through the queue and shows it, then reloads from the server", async () => {
    const posted: unknown[] = [];
    mockApi();
    const q = queueFor(async (_p, b) => { posted.push(b); session = { ...session, sets: [{ id: "x1", exerciseId: "e1", setNumber: 1, reps: 10, loadKg: 62.5, rpe: 8, clientId: (b as { clientId: string }).clientId }] }; });
    render(<WorkoutLogger sessionId="s1" queue={q} />);
    await screen.findByLabelText("Log a set");
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "62.5" } });
    fireEvent.change(screen.getByLabelText("RPE (1–10)"), { target: { value: "8" } });
    await act(async () => { fireEvent.click(screen.getByText("Add set")); });
    expect(posted[0]).toMatchObject({ exerciseId: "e1", reps: 10, loadKg: 62.5, rpe: 8 });
    expect(await screen.findByText(/10 reps × 62.5 kg @ RPE 8/)).toBeTruthy();
    expect(screen.queryByText(/waiting to send/)).toBeNull();
  });

  it("steppers change values; bad input is refused with a clear message and nothing is queued", async () => {
    mockApi();
    const q = queueFor(async () => undefined);
    render(<WorkoutLogger sessionId="s1" queue={q} />);
    await screen.findByLabelText("Log a set");
    fireEvent.click(screen.getByLabelText("Increase Reps"));
    expect((screen.getByLabelText("Reps") as HTMLInputElement).value).toBe("9");
    fireEvent.click(screen.getByLabelText("Increase Weight (kg)"));
    expect((screen.getByLabelText("Weight (kg)") as HTMLInputElement).value).toBe("2.5");
    fireEvent.change(screen.getByLabelText("RPE (1–10)"), { target: { value: "11" } });
    fireEvent.click(screen.getByText("Add set"));
    expect(screen.getByRole("alert").textContent).toMatch(/RPE must be 1–10/);
    expect(q.items).toHaveLength(0);
  });

  it("offline: the set stays on screen as 'waiting to send' with an explanation", async () => {
    mockApi();
    const q = queueFor(async () => { throw new NetworkError("offline"); });
    render(<WorkoutLogger sessionId="s1" queue={q} />);
    await screen.findByLabelText("Log a set");
    await act(async () => { fireEvent.click(screen.getByText("Add set")); });
    expect(await screen.findByText(/\(waiting to send\)/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Offline.*1 waiting to send/));
  });

  it("shows a suggested load, and the calm pain pause wording when paused", async () => {
    suggestion = { action: "INCREASE", suggestedLoadKg: 61.25, explanation: "You hit 8+ reps at 60 kg in your last two workouts at RPE 8 or easier. Try 61.25 kg.", basedOnSessions: 2 };
    mockApi();
    render(<WorkoutLogger sessionId="s1" queue={queueFor(async () => undefined)} />);
    expect((await screen.findByLabelText("Suggestion")).textContent).toMatch(/try 61.25 kg/);
    cleanup();
    suggestion = { action: "HOLD", explanation: "You reported pain recently, so load suggestions are paused. Please consider speaking to a qualified professional before continuing.", basedOnSessions: 2 };
    render(<WorkoutLogger sessionId="s1" queue={queueFor(async () => undefined)} />);
    const note = await screen.findByLabelText("Suggestion");
    expect(note.textContent).toMatch(/paused/);
    expect(note.textContent).not.toMatch(/injur|diagnos/i);
  });

  it("a finished workout is read-only", async () => {
    session = { ...base, endedAt: "2030-01-01T11:00:00Z", sets: [{ id: "x1", exerciseId: "e1", setNumber: 1, reps: 5, loadKg: null, rpe: null, clientId: "c1" }] };
    mockApi();
    render(<WorkoutLogger sessionId="s1" queue={queueFor(async () => undefined)} />);
    expect(await screen.findByText("Workout (finished)")).toBeTruthy();
    expect(screen.queryByText("Add set")).toBeNull();
    expect(screen.queryByText("Finish workout")).toBeNull();
    expect(screen.getByText(/5 reps/)).toBeTruthy();
  });

  it("explains a missing or private workout", async () => {
    mockApi({ "GET /training/sessions/s1": () => Response.json({ title: "Not Found" }, { status: 404 }) });
    render(<WorkoutLogger sessionId="s1" queue={queueFor(async () => undefined)} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/doesn't exist/);
  });
});
