import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteNav } from "../lib/site-nav";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient()}><SiteNav /></QueryClientProvider>);

describe("SiteNav", () => {
  it("shows log in and sign up when signed out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ title: "Not signed in" }, { status: 401 })));
    wrap();
    expect(await screen.findByText("Log in")).toBeTruthy();
    expect(screen.getByText("Sign up")).toBeTruthy();
    expect(screen.queryByText("Log out")).toBeNull();
  });
  it("shows the name and log out when signed in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "u", email: "a@b.c", displayName: "Ada", isMinor: false, emailVerified: false })));
    wrap();
    expect(await screen.findByText("Ada")).toBeTruthy();
    expect(screen.getByText("Log out")).toBeTruthy();
    expect(screen.queryByText("Sign up")).toBeNull();
  });
});
