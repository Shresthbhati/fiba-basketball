import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxScore } from "../lib/box-score";

const line = (over: object = {}) => ({ points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, rebounds: 0, assists: 0, turnovers: 0, fouls: 0, ...over });
let calls: string[];
let status = 200;
const box = {
  home: { players: [{ jersey: 7, name: "Ann", ...line({ points: 5, fgm: 1, fga: 2, tpm: 1, tpa: 1, rebounds: 3 }) }, { jersey: null, ...line({ assists: 1 }) }], unattributed: line({ points: 2, fgm: 1, fga: 1 }), total: line({ points: 7 }) },
  away: { players: [{ jersey: 11, ...line({ points: 0 }) }], unattributed: line(), total: line() },
};

beforeEach(() => {
  calls = []; status = 200;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return status === 200 ? Response.json(box) : Response.json({ title: "Not Found" }, { status }); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("BoxScore", () => {
  it("loads only when opened, then shows per-player lines, who is not credited, and team totals", async () => {
    render(<BoxScore matchId="m1" homeName="Reds" awayName="Blues" />);
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByText("Box score"));
    const home = await screen.findByRole("table", { name: "Reds box score" });
    expect(calls).toEqual(["/api/v1/matches/m1/box-score"]);
    const ann = within(home).getByRole("row", { name: /#7 Ann/ });
    expect(within(ann).getAllByRole("cell").map((c) => c.textContent)).toEqual(["5", "1/2", "1/1", "0/0", "3", "0", "0", "0"]);
    expect(within(home).getByRole("row", { name: /Former player/ })).toBeTruthy(); // credited to someone no longer on the roster
    expect(within(home).getByRole("row", { name: /Not credited to a player/ })).toBeTruthy();
    expect(within(home).getByRole("row", { name: /^Team 7/ })).toBeTruthy();
    // Away shows a jersey without a name (names are only for people allowed to see the roster), and no "not credited" row when empty.
    const away = screen.getByRole("table", { name: "Blues box score" });
    expect(within(away).getByRole("row", { name: /#11/ })).toBeTruthy();
    expect(within(away).queryByRole("row", { name: /Not credited/ })).toBeNull();
  });

  it("shows a message if the box score cannot be loaded", async () => {
    status = 404;
    render(<BoxScore matchId="m1" homeName="Reds" awayName="Blues" />);
    fireEvent.click(screen.getByText("Box score"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Not Found"));
  });
});
