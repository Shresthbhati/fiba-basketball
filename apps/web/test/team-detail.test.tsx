import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamDetail } from "../lib/team-detail";

let calls: { key: string; body?: unknown }[];
let canManage: boolean;
let addStatus = 201;

beforeEach(() => {
  calls = []; addStatus = 201;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/v1", "")}`;
    calls.push({ key, body: init?.body });
    if (key === "GET /teams/t1/members") return Response.json({ canManage, items: [{ userId: "u1", name: "Coach C", role: "COACH" }, { userId: "u2", name: "Pat", role: "PLAYER" }] });
    if (key === "GET /teams/t1/games") return Response.json({ items: [{ id: "g1", teamId: "t1", title: "vs Lions", opponent: "Lions", playedOn: null, video: { status: "NONE" } }] });
    if (key === "POST /teams/t1/members") return addStatus === 201 ? Response.json({}, { status: 201 }) : Response.json({ title: "This player is under 18 and needs guardian consent for media use before joining a team" }, { status: 409 });
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TeamDetail", () => {
  it("members see games and the roster but no management forms", async () => {
    canManage = false;
    render(<TeamDetail teamId="t1" />);
    expect(await screen.findByText("vs Lions")).toBeTruthy();
    expect(screen.getByText(/Pat/)).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Add a member" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Add a game" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Pat" })).toBeNull();
  });

  it("a coach can add and remove members, never remove a coach, and sees the server's reason when adding fails", async () => {
    canManage = true;
    render(<TeamDetail teamId="t1" />);
    await screen.findByRole("form", { name: "Add a member" });
    expect(screen.queryByRole("button", { name: "Remove Coach C" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Pat" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /teams/t1/members/u2")).toBe(true));
    addStatus = 409;
    fireEvent.change(screen.getByLabelText(/Email of an existing account/), { target: { value: "kid@example.com" } });
    fireEvent.click(screen.getByText("Add to team"));
    expect((await screen.findByRole("alert")).textContent).toContain("needs guardian consent");
  });

  it("shows a not-found message when the server hides the team", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    render(<TeamDetail teamId="t1" />);
    expect(await screen.findByText(/could not find that team/)).toBeTruthy();
  });
});
