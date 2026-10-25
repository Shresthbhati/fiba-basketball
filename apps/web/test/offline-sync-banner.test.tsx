import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { OfflineSyncBanner } from "../lib/offline-sync-banner";

describe("OfflineSyncBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders nothing when online with zero pending queued items", () => {
    render(<OfflineSyncBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("displays Offline Mode banner when device goes offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    render(<OfflineSyncBanner />);

    const banner = screen.getByRole("status");
    expect(banner).toBeDefined();
    expect(screen.getByText("Offline Mode")).toBeDefined();
    expect(screen.getByText(/You are disconnected/)).toBeDefined();
  });

  it("detects pending items in localStorage and displays badge with breakdown", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    // Seed mock score queue in localStorage
    localStorage.setItem(
      "ciq.score.match-42",
      JSON.stringify({
        matchId: "match-42",
        pending: [
          { id: "e1", type: "FIELD_GOAL" },
          { id: "e2", type: "THREE_POINT" },
        ],
      })
    );

    // Seed mock sets queue in localStorage
    localStorage.setItem(
      "ciq.sets.session-99",
      JSON.stringify({
        pending: [{ clientId: "s1", exerciseId: "ex1", reps: 10 }],
      })
    );

    render(<OfflineSyncBanner />);

    // Total = 2 + 1 = 3
    expect(screen.getByText("3 queued")).toBeDefined();

    // Toggle Breakdown
    const toggleBtn = screen.getByText("View Breakdown");
    fireEvent.click(toggleBtn);

    expect(screen.getByText("Match Events:")).toBeDefined();
    expect(screen.getByText(/2 pending/)).toBeDefined();
    expect(screen.getByText("Training Sets:")).toBeDefined();
    expect(screen.getByText(/1 pending/)).toBeDefined();
  });

  it("displays Pending Synchronization and fires ciq:sync when Sync Now is clicked", async () => {
    vi.stubGlobal("navigator", { onLine: true });

    // Seed queued event while online
    localStorage.setItem(
      "ciq.score.match-42",
      JSON.stringify({
        matchId: "match-42",
        pending: [{ id: "e1", type: "FIELD_GOAL" }],
      })
    );

    const syncListener = vi.fn();
    window.addEventListener("ciq:sync", syncListener);

    render(<OfflineSyncBanner />);

    expect(screen.getByText("Pending Synchronization")).toBeDefined();
    expect(screen.getByText("1 queued")).toBeDefined();

    const syncBtn = screen.getByRole("button", { name: "Sync Now" });
    await act(async () => {
      fireEvent.click(syncBtn);
    });

    expect(syncListener).toHaveBeenCalledTimes(1);
    window.removeEventListener("ciq:sync", syncListener);
  });
});
