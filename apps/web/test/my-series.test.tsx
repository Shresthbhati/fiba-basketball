import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySeries } from "../lib/my-series";

let calls: string[];
let items: object[];
let stopStatus = 200;

beforeEach(() => {
  calls = []; stopStatus = 200;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/v1", "")}`;
    calls.push(key);
    if (key === "GET /pickup/series/mine") return Response.json({ items });
    if (key.startsWith("POST /pickup/series/") && key.endsWith("/cancel")) {
      if (stopStatus !== 200) return Response.json({ title: "Not Found" }, { status: 404 });
      items = [];
      return Response.json({ cancelledGames: 4 });
    }
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const sunday = { id: "s1", title: "Sunday run", weekday: 0, startTime: "18:00", durationMin: 120, timezone: "America/New_York" };

describe("MySeries", () => {
  it("renders nothing when the visitor has no weekly games (or is signed out)", async () => {
    items = [];
    const { container } = render(<MySeries />);
    await waitFor(() => expect(calls).toContain("GET /pickup/series/mine"));
    expect(container.textContent).toBe("");
  });

  it("lists weekly games and stopping one removes it", async () => {
    items = [sunday];
    render(<MySeries />);
    expect(await screen.findByText(/Sundays at 18:00 \(America\/New_York\), 120 min/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop Sunday run" }));
    await waitFor(() => expect(calls).toContain("POST /pickup/series/s1/cancel"));
    await waitFor(() => expect(screen.queryByText("Sunday run")).toBeNull());
  });

  it("shows the server's message when stopping fails and keeps the game listed", async () => {
    items = [sunday]; stopStatus = 404;
    render(<MySeries />);
    fireEvent.click(await screen.findByRole("button", { name: "Stop Sunday run" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Not Found");
    expect(screen.getByText("Sunday run")).toBeTruthy();
  });
});
