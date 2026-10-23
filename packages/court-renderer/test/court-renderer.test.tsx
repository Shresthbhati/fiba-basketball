import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CourtRenderer,
  TokenOverlay,
  type TacticalToken,
  type TacticalAction,
} from "../src";

describe("CourtRenderer Component", () => {
  it("renders half court SVG with standard markings and accessibility label", () => {
    render(<CourtRenderer mode="half" theme="dark" width={700} height={500} />);

    const svg = screen.getByRole("img", { name: /FIBA Half Basketball Court Diagram/i });
    expect(svg).toBeDefined();
    expect(screen.getByTestId("court-boundary")).toBeDefined();
    expect(screen.getByTestId("court-center")).toBeDefined();
    expect(screen.getByTestId("court-basket-right")).toBeDefined();
    expect(screen.queryByTestId("court-basket-left")).toBeNull();
  });

  it("renders full court SVG with both baskets when mode is full", () => {
    render(<CourtRenderer mode="full" theme="light" width={900} height={500} />);

    const svg = screen.getByRole("img", { name: /FIBA Full Basketball Court Diagram/i });
    expect(svg).toBeDefined();
    expect(screen.getByTestId("court-basket-right")).toBeDefined();
    expect(screen.getByTestId("court-basket-left")).toBeDefined();
  });

  it("calls onCourtClick with translated court coordinates in meters", () => {
    const handleClick = vi.fn();
    render(
      <CourtRenderer
        mode="half"
        width={700}
        height={500}
        padding={20}
        interactive={true}
        onCourtClick={handleClick}
      />
    );

    const svg = screen.getByRole("img");

    // Mock getBoundingClientRect
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 700,
      height: 500,
      right: 700,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.click(svg, { clientX: 350, clientY: 250 });

    expect(handleClick).toHaveBeenCalledTimes(1);
    const firstCall = handleClick.mock.calls[0];
    expect(firstCall).toBeDefined();
    const coords = firstCall![0];
    expect(typeof coords.x).toBe("number");
    expect(typeof coords.y).toBe("number");
    // Center of half-court (700x500 with 20 padding) corresponds to x ≈ 7.0m, y ≈ 0.0m
    expect(coords.x).toBeCloseTo(7.0, 0);
    expect(coords.y).toBeCloseTo(0.0, 0);
  });

  it("renders tactical tokens and action paths correctly", () => {
    const tokens: TacticalToken[] = [
      { id: "p1", type: "offense", label: "1", x: 7.0, y: 0.0 },
      { id: "p2", type: "offense", label: "2", x: 12.0, y: 6.0 },
      { id: "d1", type: "defense", label: "x1", x: 8.0, y: 0.0 },
      { id: "ball", type: "ball", label: "ball", x: 7.0, y: 0.0 },
    ];

    const actions: TacticalAction[] = [
      { id: "a1", type: "cut", from: { x: 7.0, y: 0.0 }, to: { x: 10.0, y: -2.0 } },
      { id: "a2", type: "pass", from: { x: 7.0, y: 0.0 }, to: { x: 12.0, y: 6.0 } },
      { id: "a3", type: "dribble", from: { x: 7.0, y: 0.0 }, to: { x: 9.0, y: 3.0 } },
      { id: "a4", type: "screen", from: { x: 9.0, y: 2.0 }, to: { x: 8.0, y: 0.0 } },
      { id: "a5", type: "slide", from: { x: 8.0, y: 0.0 }, to: { x: 9.0, y: 1.0 } },
    ];

    const viewport = {
      width: 700,
      height: 500,
      padding: 20,
      mode: "half" as const,
      orientation: "horizontal" as const,
    };

    render(
      <CourtRenderer mode="half" width={700} height={500} padding={20}>
        <TokenOverlay tokens={tokens} actions={actions} viewport={viewport} />
      </CourtRenderer>
    );

    expect(screen.getByTestId("token-p1")).toBeDefined();
    expect(screen.getByTestId("token-p2")).toBeDefined();
    expect(screen.getByTestId("token-d1")).toBeDefined();
    expect(screen.getByTestId("token-ball")).toBeDefined();

    expect(screen.getByTestId("action-cut-a1")).toBeDefined();
    expect(screen.getByTestId("action-pass-a2")).toBeDefined();
    expect(screen.getByTestId("action-dribble-a3")).toBeDefined();
    expect(screen.getByTestId("action-screen-a4")).toBeDefined();
    expect(screen.getByTestId("action-slide-a5")).toBeDefined();
  });
});
