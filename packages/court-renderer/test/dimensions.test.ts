import { describe, it, expect } from "vitest";
import {
  FIBA_DIMENSIONS,
  getCourtBoundsMeters,
  courtToSvg,
  svgToCourt,
  distanceMeters,
  isThreePointer,
  isWithinCourt,
} from "../src";

describe("FIBA Court Dimensions & Coordinates", () => {
  it("defines exact FIBA official dimensions", () => {
    expect(FIBA_DIMENSIONS.courtLength).toBe(28.0);
    expect(FIBA_DIMENSIONS.courtWidth).toBe(15.0);
    expect(FIBA_DIMENSIONS.halfCourtLength).toBe(14.0);
    expect(FIBA_DIMENSIONS.centerCircleRadius).toBe(1.80);
    expect(FIBA_DIMENSIONS.threePointRadius).toBe(6.75);
    expect(FIBA_DIMENSIONS.threePointCornerOffsetFromSideline).toBe(0.90);
    expect(FIBA_DIMENSIONS.threePointCornerY).toBe(6.60);
    expect(FIBA_DIMENSIONS.keyWidth).toBe(4.90);
    expect(FIBA_DIMENSIONS.keyLength).toBe(5.80);
    expect(FIBA_DIMENSIONS.hoopOffsetFromBaseline).toBe(1.575);
    expect(FIBA_DIMENSIONS.backboardOffsetFromBaseline).toBe(1.20);
    expect(FIBA_DIMENSIONS.noChargeSemiCircleRadius).toBe(1.25);
  });

  it("calculates court bounds in meters for full and half court", () => {
    const full = getCourtBoundsMeters("full", "horizontal");
    expect(full.minX).toBe(-14.0);
    expect(full.maxX).toBe(14.0);
    expect(full.minY).toBe(-7.5);
    expect(full.maxY).toBe(7.5);

    const half = getCourtBoundsMeters("half", "horizontal");
    expect(half.minX).toBe(0);
    expect(half.maxX).toBe(14.0);
    expect(half.minY).toBe(-7.5);
    expect(half.maxY).toBe(7.5);
  });

  it("converts court meters to SVG and round-trips back to meters with sub-millimeter precision", () => {
    const viewport = {
      width: 700,
      height: 500,
      padding: 20,
      mode: "half" as const,
      orientation: "horizontal" as const,
    };

    const originalPoints = [
      { x: 0, y: 0 }, // Half court center
      { x: 12.425, y: 0 }, // Hoop center
      { x: 14.0, y: 6.60 }, // Corner 3 point baseline
      { x: 8.20, y: 0 }, // Free throw line
      { x: 14.0, y: -7.5 }, // Corner baseline/sideline
    ];

    for (const pt of originalPoints) {
      const svg = courtToSvg(pt, viewport);
      const recovered = svgToCourt(svg, viewport);
      expect(Math.abs(recovered.x - pt.x)).toBeLessThan(0.0001);
      expect(Math.abs(recovered.y - pt.y)).toBeLessThan(0.0001);
    }
  });

  it("computes Euclidean distance in meters accurately", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 3, y: 4 };
    expect(distanceMeters(a, b)).toBeCloseTo(5.0, 4);
  });

  it("classifies 3-pointers accurately under FIBA geometry", () => {
    // Hoop is at (12.425, 0)
    // Point at 6.75m straight out along x axis: x = 12.425 - 6.75 = 5.675
    expect(isThreePointer({ x: 5.60, y: 0 }, "half")).toBe(true); // Beyond arc
    expect(isThreePointer({ x: 7.00, y: 0 }, "half")).toBe(false); // Inside arc

    // Corner 3: at y = 6.60 and x = 13.0m (within corner straight section)
    expect(isThreePointer({ x: 13.0, y: 6.65 }, "half")).toBe(true);
    expect(isThreePointer({ x: 13.0, y: 5.00 }, "half")).toBe(false); // Corner 2-pointer
  });

  it("validates boundary confinement", () => {
    expect(isWithinCourt({ x: 0, y: 0 }, "half")).toBe(true);
    expect(isWithinCourt({ x: 14, y: 7.5 }, "half")).toBe(true);
    expect(isWithinCourt({ x: 14.1, y: 0 }, "half")).toBe(false); // Beyond baseline
    expect(isWithinCourt({ x: 5, y: 7.6 }, "half")).toBe(false); // Out of bounds sideline
    expect(isWithinCourt({ x: -2, y: 0 }, "half")).toBe(false); // Across half-court in half mode
    expect(isWithinCourt({ x: -2, y: 0 }, "full")).toBe(true); // Valid in full court
  });
});
