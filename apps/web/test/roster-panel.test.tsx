import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RosterPanel } from "../lib/roster-panel";

let calls: { key: string; body?: unknown }[];
let roster: object;
let failWith: { status: number; title: string } | null;
let putStatus = 204;

beforeEach(() => {
  calls = []; failWith = null; putStatus = 204;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/v1", "")}`;
    calls.push({ key, body: init?.body });
    if (key.startsWith("GET") && failWith) return Response.json({ title: failWith.title }, { status: failWith.status });
    if (key.startsWith("GET")) return Response.json(roster);
    if (key.startsWith("PUT") && putStatus !== 204) return Response.json({ title: "Jersey number 7 is already taken on this team" }, { status: 409 });
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const editable = {
  canEdit: true, max: 15, items: [{ userId: "u1", name: "Pat", jersey: 7 }],
  candidates: [{ userId: "u2", name: "Sam" }],
};

describe("RosterPanel", () => {
  it("shows the roster read-only for players", async () => {
    roster = { ...editable, canEdit: false, candidates: [] };
    render(<RosterPanel competitionId="c1" teamId="t1" />);
    expect(await screen.findByText("Pat")).toBeTruthy();
    expect(screen.getByText("#7")).toBeTruthy();
    expect(screen.getByText(/1 of 15 players · roster is closed/)).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Add a player" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("a coach picks a candidate and a jersey number, and can remove a player", async () => {
    roster = editable;
    render(<RosterPanel competitionId="c1" teamId="t1" />);
    await screen.findByRole("form", { name: "Add a player" });
    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "u2" } });
    fireEvent.change(screen.getByLabelText("Jersey number"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("Add to roster"));
    await waitFor(() => expect(calls.find((c) => c.key === "PUT /competitions/c1/teams/t1/roster/u2")?.body).toBe(JSON.stringify({ jersey: 12 })));
    fireEvent.click(screen.getByRole("button", { name: "Remove Pat" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /competitions/c1/teams/t1/roster/u1")).toBe(true));
  });

  it("shows the server's reason when a jersey number is taken", async () => {
    roster = editable; putStatus = 409;
    render(<RosterPanel competitionId="c1" teamId="t1" />);
    await screen.findByRole("form", { name: "Add a player" });
    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "u2" } });
    fireEvent.change(screen.getByLabelText("Jersey number"), { target: { value: "7" } });
    fireEvent.click(screen.getByText("Add to roster"));
    expect((await screen.findByRole("alert")).textContent).toContain("already taken");
  });

  it("explains, without leaking anything, when the roster is not visible to this person", async () => {
    roster = editable; failWith = { status: 404, title: "Not Found" };
    render(<RosterPanel competitionId="c1" teamId="t1" />);
    expect(await screen.findByText(/could not find that roster/)).toBeTruthy();
    expect(screen.queryByText("Pat")).toBeNull();
  });
});
