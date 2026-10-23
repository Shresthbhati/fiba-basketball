import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "../lib/notifications-panel";

let calls: { key: string; body?: unknown }[];
let inbox: { items: object[]; unread: number };
let status = 200;
let settings: { email: boolean; emailAvailable: boolean };

beforeEach(() => {
  calls = []; status = 200; settings = { email: true, emailAvailable: true };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/v1", "")}`;
    calls.push({ key, body: init?.body });
    if (status !== 200) return Response.json({ title: "Not signed in" }, { status });
    if (key === "GET /notifications") return Response.json(inbox);
    if (key === "GET /notifications/settings") return Response.json(settings);
    if (key === "PUT /notifications/settings") { settings = { ...settings, email: JSON.parse(String(init?.body)).email }; return new Response(null, { status: 204 }); }
    if (key === "POST /notifications/read") { inbox = { items: inbox.items.map((n) => ({ ...n, read: true })), unread: 0 }; return new Response(null, { status: 204 }); }
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient()}><NotificationsPanel /></QueryClientProvider>);
const cancelled = { id: "n1", kind: "GAME_CANCELLED", title: 'Cancelled: "Run"', link: "/pickup/g1", data: { startsAt: "2027-03-14T22:00:00.000Z" }, createdAt: "2026-10-23T10:00:00.000Z", read: false };

describe("NotificationsPanel", () => {
  it("shows the empty state", async () => {
    inbox = { items: [], unread: 0 };
    wrap();
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
    expect(screen.queryByText("Mark all as read")).toBeNull();
  });

  it("lists notifications, flags unread ones for screen readers, and marks one read when opened", async () => {
    inbox = { items: [cancelled, { ...cancelled, id: "n2", title: "You were added to Hawks", kind: "ADDED_TO_TEAM", link: "/teams/t1", data: null, read: true }], unread: 1 };
    wrap();
    const link = await screen.findByRole("link", { name: 'Cancelled: "Run"' });
    expect(link.getAttribute("href")).toBe("/pickup/g1");
    expect(screen.getAllByText("(unread)")).toHaveLength(1);
    expect(screen.getByText(/Game time:/)).toBeTruthy();
    fireEvent.click(link);
    await waitFor(() => expect(calls.find((c) => c.key === "POST /notifications/read")?.body).toBe(JSON.stringify({ ids: ["n1"] })));
  });

  it("marks everything read", async () => {
    inbox = { items: [cancelled], unread: 1 };
    wrap();
    fireEvent.click(await screen.findByText("Mark all as read"));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /notifications/read")?.body).toBe("{}"));
    await waitFor(() => expect(screen.queryByText("Mark all as read")).toBeNull());
  });

  it("asks signed-out visitors to log in", async () => {
    status = 401; inbox = { items: [], unread: 0 };
    wrap();
    expect(await screen.findByRole("link", { name: "Log in" })).toBeTruthy();
  });

  it("lets people turn email off and on, and saves each choice", async () => {
    inbox = { items: [], unread: 0 };
    wrap();
    const box = (await screen.findByLabelText(/Email me when a game is cancelled/)) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(calls.find((c) => c.key === "PUT /notifications/settings")?.body).toBe(JSON.stringify({ email: false })));
    await waitFor(() => expect((screen.getByLabelText(/Email me when/) as HTMLInputElement).checked).toBe(false));
  });

  it("switches the checkbox straight away and puts it back with a message if saving fails", async () => {
    inbox = { items: [], unread: 0 };
    wrap();
    const box = (await screen.findByLabelText(/Email me when/)) as HTMLInputElement;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) =>
      init?.method === "PUT" ? Response.json({ title: "Server error" }, { status: 500 }) : Response.json(url.endsWith("/settings") ? settings : inbox)));
    fireEvent.click(box);
    expect(box.checked).toBe(false); // immediate
    expect((await screen.findByRole("alert")).textContent).toBe("Server error");
    await waitFor(() => expect(box.checked).toBe(true));
  });

  it("tells under-18 accounts email is not available instead of offering a switch", async () => {
    inbox = { items: [], unread: 0 }; settings = { email: true, emailAvailable: false };
    wrap();
    expect(await screen.findByText(/not available for under-18 accounts/)).toBeTruthy();
    expect(screen.queryByLabelText(/Email me when/)).toBeNull();
  });
});
