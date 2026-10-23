import { FIBA_DIMENSIONS, type CourtMode, type CourtOrientation } from "./dimensions";

export interface CourtPoint {
  x: number;
  y: number;
}

export interface CourtViewport {
  width: number;
  height: number;
  padding?: number;
  mode: CourtMode;
  orientation?: CourtOrientation;
}

/**
 * Returns court bounds in meters based on mode and orientation.
 */
export function getCourtBoundsMeters(mode: CourtMode, orientation: CourtOrientation = "horizontal"): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  lengthMeters: number;
  widthMeters: number;
} {
  const isHalf = mode === "half";
  const isVertical = orientation === "vertical";

  if (isHalf) {
    if (isVertical) {
      // Y is 0 to 14 (0 = half court line, 14 = baseline), X is -7.5 to +7.5
      return {
        minX: -FIBA_DIMENSIONS.courtWidth / 2,
        maxX: FIBA_DIMENSIONS.courtWidth / 2,
        minY: 0,
        maxY: FIBA_DIMENSIONS.halfCourtLength,
        lengthMeters: FIBA_DIMENSIONS.halfCourtLength,
        widthMeters: FIBA_DIMENSIONS.courtWidth,
      };
    }
    // Horizontal half court: X is 0 to 14 (0 = half court line, 14 = baseline), Y is -7.5 to +7.5
    return {
      minX: 0,
      maxX: FIBA_DIMENSIONS.halfCourtLength,
      minY: -FIBA_DIMENSIONS.courtWidth / 2,
      maxY: FIBA_DIMENSIONS.courtWidth / 2,
      lengthMeters: FIBA_DIMENSIONS.halfCourtLength,
      widthMeters: FIBA_DIMENSIONS.courtWidth,
    };
  }

  // Full court
  if (isVertical) {
    return {
      minX: -FIBA_DIMENSIONS.courtWidth / 2,
      maxX: FIBA_DIMENSIONS.courtWidth / 2,
      minY: -FIBA_DIMENSIONS.courtLength / 2,
      maxY: FIBA_DIMENSIONS.courtLength / 2,
      lengthMeters: FIBA_DIMENSIONS.courtLength,
      widthMeters: FIBA_DIMENSIONS.courtWidth,
    };
  }

  return {
    minX: -FIBA_DIMENSIONS.courtLength / 2,
    maxX: FIBA_DIMENSIONS.courtLength / 2,
    minY: -FIBA_DIMENSIONS.courtWidth / 2,
    maxY: FIBA_DIMENSIONS.courtWidth / 2,
    lengthMeters: FIBA_DIMENSIONS.courtLength,
    widthMeters: FIBA_DIMENSIONS.courtWidth,
  };
}

/**
 * Converts a court coordinate (in meters) to SVG pixel coordinates.
 */
export function courtToSvg(courtPt: CourtPoint, viewport: CourtViewport): CourtPoint {
  const pad = viewport.padding ?? 20;
  const orient = viewport.orientation ?? "horizontal";
  const bounds = getCourtBoundsMeters(viewport.mode, orient);

  const drawWidth = viewport.width - pad * 2;
  const drawHeight = viewport.height - pad * 2;

  // Scale factors
  const scaleX = drawWidth / (bounds.maxX - bounds.minX);
  const scaleY = drawHeight / (bounds.maxY - bounds.minY);

  const svgX = pad + (courtPt.x - bounds.minX) * scaleX;
  const svgY = pad + (courtPt.y - bounds.minY) * scaleY;

  return { x: svgX, y: svgY };
}

/**
 * Converts an SVG pixel coordinate to court coordinates (in meters).
 */
export function svgToCourt(svgPt: CourtPoint, viewport: CourtViewport): CourtPoint {
  const pad = viewport.padding ?? 20;
  const orient = viewport.orientation ?? "horizontal";
  const bounds = getCourtBoundsMeters(viewport.mode, orient);

  const drawWidth = viewport.width - pad * 2;
  const drawHeight = viewport.height - pad * 2;

  const scaleX = drawWidth / (bounds.maxX - bounds.minX);
  const scaleY = drawHeight / (bounds.maxY - bounds.minY);

  const courtX = bounds.minX + (svgPt.x - pad) / scaleX;
  const courtY = bounds.minY + (svgPt.y - pad) / scaleY;

  return { x: courtX, y: courtY };
}

/**
 * Calculates Euclidean distance in meters between two points on the court.
 */
export function distanceMeters(a: CourtPoint, b: CourtPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Determines whether a given court point is a 3-pointer under FIBA specifications.
 */
export function isThreePointer(
  pt: CourtPoint,
  basket: "right" | "left" | "half" = "right"
): boolean {
  // Hoop positions:
  // Right / Half hoop: x = 14.0 - 1.575 = 12.425, y = 0
  // Left hoop: x = -12.425, y = 0
  const hoopX = basket === "left" ? -12.425 : 12.425;
  const hoopY = 0;

  const absY = Math.abs(pt.y);

  // If beyond the corner 3 straight line (0.90m from sideline -> y >= 6.60m)
  // and in the offensive zone:
  const isRightOrHalf = basket === "right" || basket === "half";

  // The straight corner 3-point segment runs from baseline to the arc transition point
  if (absY >= FIBA_DIMENSIONS.threePointCornerY) {
    if (isRightOrHalf) {
      if (pt.x >= 14.0 - (FIBA_DIMENSIONS.hoopOffsetFromBaseline + FIBA_DIMENSIONS.threePointArcDx) && pt.x <= 14.0) {
        return true;
      }
    } else {
      if (pt.x <= -14.0 + (FIBA_DIMENSIONS.hoopOffsetFromBaseline + FIBA_DIMENSIONS.threePointArcDx) && pt.x >= -14.0) {
        return true;
      }
    }
  }

  // Radius check from the hoop center
  const dist = distanceMeters(pt, { x: hoopX, y: hoopY });
  return dist >= FIBA_DIMENSIONS.threePointRadius;
}

/**
 * Checks if a point is within the playing court boundaries.
 */
export function isWithinCourt(pt: CourtPoint, mode: CourtMode = "full"): boolean {
  const halfLen = FIBA_DIMENSIONS.halfCourtLength;
  const halfWidth = FIBA_DIMENSIONS.courtWidth / 2;

  if (Math.abs(pt.y) > halfWidth) return false;

  if (mode === "half") {
    return pt.x >= 0 && pt.x <= halfLen;
  }
  return pt.x >= -halfLen && pt.x <= halfLen;
}
