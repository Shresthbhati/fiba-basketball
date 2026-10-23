/**
 * FIBA Official Basketball Court Dimensions (in meters).
 * Reference: FIBA Official Basketball Rules (Court & Equipment Specifications).
 */
export const FIBA_DIMENSIONS = {
  // Overall court size
  courtLength: 28.0,
  courtWidth: 15.0,
  halfCourtLength: 14.0,
  lineWidth: 0.05, // 5 cm lines

  // Center circle
  centerCircleRadius: 1.80,
  centerCircleDiameter: 3.60,
  centerLineExtension: 0.15, // extends 15 cm past sidelines

  // Basket & Backboard
  backboardOffsetFromBaseline: 1.20,
  backboardWidth: 1.80,
  backboardThickness: 0.03,
  hoopOffsetFromBaseline: 1.575,
  hoopRadius: 0.225, // 45 cm diameter
  noChargeSemiCircleRadius: 1.25, // restricted area arc from hoop center

  // Key / Free-throw lane (rectangular FIBA standard)
  keyWidth: 4.90, // -2.45m to +2.45m along Y
  keyLength: 5.80, // from baseline to outer edge of free throw line
  freeThrowLineOffsetFromBaseline: 5.80,
  freeThrowCircleRadius: 1.80,

  // 3-Point line
  threePointRadius: 6.75, // from hoop center
  threePointCornerOffsetFromSideline: 0.90, // distance from sideline to straight corner line
  threePointCornerY: 6.60, // 7.50 - 0.90
  // Transition x where straight line meets the 6.75m arc:
  // (x - x_hoop)^2 + 6.60^2 = 6.75^2 => dx = sqrt(6.75^2 - 6.60^2) = sqrt(45.5625 - 43.56) = sqrt(2.0025) ≈ 1.4151
  threePointArcDx: Math.sqrt(6.75 * 6.75 - 6.60 * 6.60), // ≈ 1.415097

  // Rebound lane spaces along key
  reboundLaneSpaces: [
    { distance: 1.75, length: 0.10 }, // 1st space
    { distance: 1.75 + 0.40, length: 0.10 }, // neutral zone (0.40m wide)
    { distance: 1.75 + 0.40 + 0.85, length: 0.10 }, // 2nd space
    { distance: 1.75 + 0.40 + 0.85 + 0.85, length: 0.10 }, // 3rd space
  ],
} as const;

export type CourtMode = "full" | "half";
export type CourtOrientation = "horizontal" | "vertical";
export type CourtTheme = "dark" | "light" | "hardwood";
