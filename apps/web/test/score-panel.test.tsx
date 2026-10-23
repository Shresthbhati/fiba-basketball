import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NetworkError } from "../lib/api";
import { ScorePanel } from "../lib/score-panel";
import { ScoreQueue, type Post, type Saved, type Store } from "../lib/score-queue";

afterEach(() => { cleanup(); localStorage.clear(); });
const store = (): Store => { const d = new Map<string, Saved>(); return { load: (k) => d.get(k) ?? null, save: (k, v) => void d.set(k, v) }; };
const offline: Post = async () => { throw new NetworkError("offline"); };
const online: Post = async (_p, body) => {
  const n = (body as { events: unknown[] }).events.length;
  return { version: n, accepted: n, duplicates: 0, state: { version: n, homeScore: 3, awayScore: 0, period: 1 } };
};

describe("ScorePanel", () => {
  it("shows the score immediately and explains the offline state with a pending count", async () => {
    const q = new ScoreQueue("m", offline, store());
    render(<ScorePanel queue={q} />);
    await act(async () => { fireEvent.click(screen.getByLabelText("Home +3 points")); });
    expect(screen.getByLabelText("Home").textContent).toContain("3");
    expect(screen.getByRole("status").textContent).toMatch(/Offline/);
    expect(screen.getByRole("status").textContent).toMatch(/1 waiting to send/);
  });

  it("undo removes the points, and saved state is reported once the server confirms", async () => {
    const q = new ScoreQueue("m", offline, store());
    render(<ScorePanel queue={q} />);
    await act(async () => { fireEvent.click(screen.getByLabelText("Away +2 points")); });
    await act(async () => { fireEvent.click(screen.getByText("Undo last")); });
    expect(screen.getByLabelText("Away").textContent).toContain("0");

    const q2 = new ScoreQueue("m2", online, store());
    cleanup();
    render(<ScorePanel queue={q2} />);
    await act(async () => { fireEvent.click(screen.getByLabelText("Home +3 points")); });
    expect(screen.getByRole("status").textContent).toMatch(/All changes saved/);
  });

  it("stamps the game clock on each event, and the scorer can start, stop, set and reset it", async () => {
    const q = new ScoreQueue("mc", offline, store());
    render(<ScorePanel queue={q} />);
    const timer = () => screen.getByRole("timer").textContent;
    expect(timer()).toBe("10:00");
    await act(async () => { fireEvent.click(screen.getByLabelText("Home +2 points")); });
    expect(q.pending[0]!.clockSeconds).toBe(600);

    fireEvent.change(screen.getByLabelText("Set clock"), { target: { value: "7:30" } });
    fireEvent.click(screen.getByText("Set"));
    expect(timer()).toBe("7:30");
    await act(async () => { fireEvent.click(screen.getByLabelText("Away +3 points")); });
    expect(q.pending[1]!.clockSeconds).toBe(450);

    fireEvent.change(screen.getByLabelText("Set clock"), { target: { value: "nonsense" } });
    fireEvent.click(screen.getByText("Set"));
    expect(timer()).toBe("7:30");
    expect(screen.getByText(/minutes:seconds/)).toBeTruthy();

    fireEvent.click(screen.getByText("Start clock"));
    expect(screen.getByText("Stop clock")).toBeTruthy();
    fireEvent.click(screen.getByText("Stop clock"));
    expect(screen.getByText("Start clock")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "2" } });
    expect(timer()).toBe("10:00");
  });

  it("shows the conflict dialog with both choices", async () => {
    const q = new ScoreQueue("m3", offline, store());
    q.conflict = { currentVersion: 2, state: { version: 2, homeScore: 4, awayScore: 2, period: 1 }, newerEvents: [] };
    q.status = "conflict";
    render(<ScorePanel queue={q} />);
    expect(screen.getByRole("alertdialog").textContent).toMatch(/4 – 2/);
    expect(screen.getByText("Keep mine and add them on top")).toBeTruthy();
    expect(screen.getByText("Discard mine and use the official score")).toBeTruthy();
  });

  describe("player credit", () => {
    const rosters = { home: [{ userId: "h1", name: "Ann", jersey: 7 }, { userId: "h2", name: "Cy", jersey: 9 }], away: [{ userId: "a1", name: "Bea", jersey: 11 }] };
    const sent = (q: ScoreQueue) => q.pending.map((e) => ({ type: e.type, side: e.side, playerId: e.playerId }));

    it("shows no picker without rosters, and scoring works as before", async () => {
      const q = new ScoreQueue("p0", offline, store());
      render(<ScorePanel queue={q} rosters={null} />);
      expect(screen.queryByRole("group", { name: /player/ })).toBeNull();
      await act(async () => { fireEvent.click(screen.getByLabelText("Home +2 points")); });
      expect(sent(q)).toEqual([{ type: "FIELD_GOAL", side: "home", playerId: undefined }]);
    });

    it("credits events to the chosen player until another is chosen, per side, and never credits non-player events", async () => {
      const q = new ScoreQueue("p1", offline, store());
      render(<ScorePanel queue={q} rosters={rosters} />);
      const home = screen.getByRole("group", { name: "Home player" });
      const away = screen.getByRole("group", { name: "Away player" });
      await act(async () => { fireEvent.click(home.querySelector('[aria-label="#7 Ann"]')!); });
      await act(async () => { fireEvent.click(screen.getByLabelText("Home +3 points")); });
      await act(async () => { fireEvent.click(screen.getByLabelText("Home +2 points")); }); // still Ann
      await act(async () => { fireEvent.click(away.querySelector('[aria-label="#11 Bea"]')!); });
      await act(async () => { fireEvent.click(screen.getByLabelText("Away +1 points")); });
      await act(async () => { fireEvent.click(home.querySelector('[aria-label="#9 Cy"]')!); });
      await act(async () => { fireEvent.click(screen.getByLabelText("Home +1 points")); });
      await act(async () => { fireEvent.click(screen.getAllByText("Timeout")[0]!); }); // home timeout: a team event
      await act(async () => { fireEvent.click(home.querySelector("button")!); }); // "No player"
      await act(async () => { fireEvent.click(screen.getByLabelText("Home +2 points")); });
      expect(sent(q)).toEqual([
        { type: "THREE_POINT", side: "home", playerId: "h1" }, { type: "FIELD_GOAL", side: "home", playerId: "h1" },
        { type: "FREE_THROW", side: "away", playerId: "a1" }, { type: "FREE_THROW", side: "home", playerId: "h2" },
        { type: "TIMEOUT", side: "home", playerId: undefined }, { type: "FIELD_GOAL", side: "home", playerId: undefined },
      ]);
    });

    it("the extra stat buttons (misses, rebound, assist, turnover) are credited the same way", async () => {
      const q = new ScoreQueue("p2", offline, store());
      render(<ScorePanel queue={q} rosters={rosters} />);
      await act(async () => { fireEvent.click(screen.getByLabelText("#7 Ann")); });
      await act(async () => { fireEvent.click(screen.getByLabelText("Home Rebound")); });
      await act(async () => { fireEvent.click(screen.getByLabelText("Home Miss 3")); });
      expect(sent(q)).toEqual([{ type: "REBOUND", side: "home", playerId: "h1" }, { type: "THREE_POINT_MISSED", side: "home", playerId: "h1" }]);
      expect(screen.getByLabelText("Home").textContent).toContain("0"); // misses don't change the score
    });
  });
});
