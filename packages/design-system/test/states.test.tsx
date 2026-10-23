import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "../src/components/EmptyState";
import { ErrorState } from "../src/components/ErrorState";
import { LoadingState } from "../src/components/LoadingState";
import { StatCard } from "../src/components/StatCard";

describe("State Components", () => {
  it("renders EmptyState with action button", () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        title="No Upcoming Runs"
        description="Check back later or host your own run."
        action={{ label: "Host Run", onClick: handleAction }}
      />
    );

    expect(screen.getByRole("region", { name: "No Upcoming Runs" })).toBeTruthy();
    expect(screen.getByText("Check back later or host your own run.")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Host Run" });
    fireEvent.click(btn);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it("renders ErrorState with alert role and retry callback", () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Could not load box score" onRetry={handleRetry} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not load box score")).toBeTruthy();
    const retryBtn = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("renders LoadingState with polite status announcement", () => {
    render(<LoadingState message="Syncing match events…" />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Syncing match events…")).toBeTruthy();
  });

  it("renders StatCard with value and positive trend", () => {
    render(
      <StatCard
        label="Points Per Game"
        value="24.8"
        trend={{ direction: "up", label: "+3.2 vs last season" }}
        highlight
      />
    );

    expect(screen.getByText("Points Per Game")).toBeTruthy();
    expect(screen.getByText("24.8")).toBeTruthy();
    expect(screen.getByText(/▲ \+3.2 vs last season/)).toBeTruthy();
  });
});
