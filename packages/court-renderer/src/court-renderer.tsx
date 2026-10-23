import React from "react";
import { FIBA_DIMENSIONS, type CourtMode, type CourtOrientation, type CourtTheme } from "./dimensions";
import { courtToSvg, svgToCourt, type CourtPoint, type CourtViewport } from "./coords";

export interface CourtRendererProps {
  mode?: CourtMode;
  orientation?: CourtOrientation;
  theme?: CourtTheme;
  width?: number;
  height?: number;
  padding?: number;
  showGrid?: boolean;
  showDimensions?: boolean;
  interactive?: boolean;
  onCourtClick?: (coords: CourtPoint) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const CourtRenderer: React.FC<CourtRendererProps> = ({
  mode = "half",
  orientation = "horizontal",
  theme = "dark",
  width = mode === "half" ? 700 : 900,
  height = mode === "half" ? 500 : 500,
  padding = 30,
  showGrid = false,
  showDimensions = false,
  interactive = false,
  onCourtClick,
  className,
  style,
  children,
}) => {
  const viewport: CourtViewport = {
    width,
    height,
    padding,
    mode,
    orientation,
  };

  // Color schemes
  const colors = {
    dark: {
      bg: "#0d0e12",
      courtFloor: "#14151b",
      keyPaint: "#1b1c26",
      lines: "#cbd5e1",
      linesMuted: "#475569",
      hoop: "#f97316",
      backboard: "#f8fafc",
      grid: "#232533",
      text: "#94a3b8",
    },
    light: {
      bg: "#f8fafc",
      courtFloor: "#ffffff",
      keyPaint: "#f1f5f9",
      lines: "#334155",
      linesMuted: "#94a3b8",
      hoop: "#ea580c",
      backboard: "#0f172a",
      grid: "#e2e8f0",
      text: "#64748b",
    },
    hardwood: {
      bg: "#18130e",
      courtFloor: "#c59258",
      keyPaint: "#9b6932",
      lines: "#ffffff",
      linesMuted: "#e2e8f0",
      hoop: "#ea580c",
      backboard: "#ffffff",
      grid: "#aa7a44",
      text: "#fdf8f0",
    },
  }[theme];

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onCourtClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    const svgY = ((e.clientY - rect.top) / rect.height) * height;
    const courtCoords = svgToCourt({ x: svgX, y: svgY }, viewport);
    onCourtClick({
      x: Math.round(courtCoords.x * 100) / 100,
      y: Math.round(courtCoords.y * 100) / 100,
    });
  };

  // Render FIBA half court markings for a specific basket side ('right' or 'left')
  const renderBasketFeatures = (side: "right" | "left") => {
    const isRight = side === "right";
    const sign = isRight ? 1 : -1;
    const baselineX = sign * 14.0;
    const hoopX = sign * (14.0 - FIBA_DIMENSIONS.hoopOffsetFromBaseline);
    const backboardX = sign * (14.0 - FIBA_DIMENSIONS.backboardOffsetFromBaseline);
    const keyInnerX = sign * (14.0 - FIBA_DIMENSIONS.keyLength);

    // Baseline corners for 3PT lines
    const cornerY = FIBA_DIMENSIONS.threePointCornerY;
    const threePtTransitionX = sign * (14.0 - FIBA_DIMENSIONS.hoopOffsetFromBaseline - FIBA_DIMENSIONS.threePointArcDx);

    // SVG converted coords
    const hoopCenterSvg = courtToSvg({ x: hoopX, y: 0 }, viewport);
    const backboardTopSvg = courtToSvg({ x: backboardX, y: -FIBA_DIMENSIONS.backboardWidth / 2 }, viewport);
    const backboardBottomSvg = courtToSvg({ x: backboardX, y: FIBA_DIMENSIONS.backboardWidth / 2 }, viewport);

    // Key corners
    const keyBL = courtToSvg({ x: baselineX, y: -FIBA_DIMENSIONS.keyWidth / 2 }, viewport);
    const keyBR = courtToSvg({ x: baselineX, y: FIBA_DIMENSIONS.keyWidth / 2 }, viewport);
    const keyTL = courtToSvg({ x: keyInnerX, y: -FIBA_DIMENSIONS.keyWidth / 2 }, viewport);
    const keyTR = courtToSvg({ x: keyInnerX, y: FIBA_DIMENSIONS.keyWidth / 2 }, viewport);

    // Free throw circle
    const ftCenterSvg = courtToSvg({ x: keyInnerX, y: 0 }, viewport);
    const ftRadiusSvg = Math.abs(courtToSvg({ x: keyInnerX + FIBA_DIMENSIONS.freeThrowCircleRadius, y: 0 }, viewport).x - ftCenterSvg.x);

    // Restricted area arc (1.25m from hoop)
    const restrictedRadiusSvg = Math.abs(courtToSvg({ x: hoopX + FIBA_DIMENSIONS.noChargeSemiCircleRadius, y: 0 }, viewport).x - hoopCenterSvg.x);

    // 3PT corner straight lines
    const corner3TopBase = courtToSvg({ x: baselineX, y: -cornerY }, viewport);
    const corner3TopEnd = courtToSvg({ x: threePtTransitionX, y: -cornerY }, viewport);
    const corner3BottomBase = courtToSvg({ x: baselineX, y: cornerY }, viewport);
    const corner3BottomEnd = courtToSvg({ x: threePtTransitionX, y: cornerY }, viewport);

    // 3PT Arc (radius 6.75m)
    const threePtRadiusSvg = Math.abs(courtToSvg({ x: hoopX + (isRight ? -FIBA_DIMENSIONS.threePointRadius : FIBA_DIMENSIONS.threePointRadius), y: 0 }, viewport).x - hoopCenterSvg.x);

    // 3PT SVG arc path: from corner3TopEnd to corner3BottomEnd
    // SVG arc command: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
    const sweepFlag = isRight ? 0 : 1;
    const arcPath = `M ${corner3TopEnd.x} ${corner3TopEnd.y} A ${threePtRadiusSvg} ${threePtRadiusSvg} 0 0 ${sweepFlag} ${corner3BottomEnd.x} ${corner3BottomEnd.y}`;

    // Hoop radius in SVG
    const hoopRadiusSvg = Math.max(3, Math.abs(courtToSvg({ x: hoopX + FIBA_DIMENSIONS.hoopRadius, y: 0 }, viewport).x - hoopCenterSvg.x));

    return (
      <g key={side} data-testid={`court-basket-${side}`}>
        {/* Key Paint Fill */}
        <polygon
          points={`${keyBL.x},${keyBL.y} ${keyBR.x},${keyBR.y} ${keyTR.x},${keyTR.y} ${keyTL.x},${keyTL.y}`}
          fill={colors.keyPaint}
          stroke={colors.lines}
          strokeWidth="2"
        />

        {/* Free Throw Semi-Circle (solid towards center court) */}
        <path
          d={
            isRight
              ? `M ${keyTL.x} ${keyTL.y} A ${ftRadiusSvg} ${ftRadiusSvg} 0 0 0 ${keyTR.x} ${keyTR.y}`
              : `M ${keyTL.x} ${keyTL.y} A ${ftRadiusSvg} ${ftRadiusSvg} 0 0 1 ${keyTR.x} ${keyTR.y}`
          }
          fill="none"
          stroke={colors.lines}
          strokeWidth="2"
        />
        {/* Free Throw Inner Semi-Circle (dashed towards basket) */}
        <path
          d={
            isRight
              ? `M ${keyTL.x} ${keyTL.y} A ${ftRadiusSvg} ${ftRadiusSvg} 0 0 1 ${keyTR.x} ${keyTR.y}`
              : `M ${keyTL.x} ${keyTL.y} A ${ftRadiusSvg} ${ftRadiusSvg} 0 0 0 ${keyTR.x} ${keyTR.y}`
          }
          fill="none"
          stroke={colors.linesMuted}
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        {/* Rebound Lane Hash Marks */}
        {FIBA_DIMENSIONS.reboundLaneSpaces.map((space, idx) => {
          const markX = sign * (14.0 - space.distance);
          const topMarkInner = courtToSvg({ x: markX, y: -FIBA_DIMENSIONS.keyWidth / 2 }, viewport);
          const topMarkOuter = courtToSvg({ x: markX, y: -FIBA_DIMENSIONS.keyWidth / 2 - space.length }, viewport);
          const botMarkInner = courtToSvg({ x: markX, y: FIBA_DIMENSIONS.keyWidth / 2 }, viewport);
          const botMarkOuter = courtToSvg({ x: markX, y: FIBA_DIMENSIONS.keyWidth / 2 + space.length }, viewport);
          return (
            <g key={idx}>
              <line x1={topMarkInner.x} y1={topMarkInner.y} x2={topMarkOuter.x} y2={topMarkOuter.y} stroke={colors.lines} strokeWidth="1.5" />
              <line x1={botMarkInner.x} y1={botMarkInner.y} x2={botMarkOuter.x} y2={botMarkOuter.y} stroke={colors.lines} strokeWidth="1.5" />
            </g>
          );
        })}

        {/* Restricted Area Arc (No-charge semi-circle) */}
        <path
          d={
            isRight
              ? `M ${hoopCenterSvg.x} ${hoopCenterSvg.y - restrictedRadiusSvg} A ${restrictedRadiusSvg} ${restrictedRadiusSvg} 0 0 0 ${hoopCenterSvg.x} ${hoopCenterSvg.y + restrictedRadiusSvg}`
              : `M ${hoopCenterSvg.x} ${hoopCenterSvg.y - restrictedRadiusSvg} A ${restrictedRadiusSvg} ${restrictedRadiusSvg} 0 0 1 ${hoopCenterSvg.x} ${hoopCenterSvg.y + restrictedRadiusSvg}`
          }
          fill="none"
          stroke={colors.lines}
          strokeWidth="2"
        />

        {/* 3-Point Line (Straight Corners + 6.75m Arc) */}
        <line x1={corner3TopBase.x} y1={corner3TopBase.y} x2={corner3TopEnd.x} y2={corner3TopEnd.y} stroke={colors.lines} strokeWidth="2" />
        <line x1={corner3BottomBase.x} y1={corner3BottomBase.y} x2={corner3BottomEnd.x} y2={corner3BottomEnd.y} stroke={colors.lines} strokeWidth="2" />
        <path d={arcPath} fill="none" stroke={colors.lines} strokeWidth="2" />

        {/* Backboard & Hoop */}
        <line
          x1={backboardTopSvg.x}
          y1={backboardTopSvg.y}
          x2={backboardBottomSvg.x}
          y2={backboardBottomSvg.y}
          stroke={colors.backboard}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Support arm connecting backboard to hoop */}
        <line
          x1={backboardTopSvg.x}
          y1={hoopCenterSvg.y}
          x2={hoopCenterSvg.x}
          y2={hoopCenterSvg.y}
          stroke={colors.backboard}
          strokeWidth="2"
        />
        {/* Hoop Rim */}
        <circle
          cx={hoopCenterSvg.x}
          cy={hoopCenterSvg.y}
          r={hoopRadiusSvg}
          fill="none"
          stroke={colors.hoop}
          strokeWidth="2.5"
        />
      </g>
    );
  };

  // Center Court Features
  const renderCenterCourt = () => {
    const centerSvg = courtToSvg({ x: 0, y: 0 }, viewport);
    const centerRadiusSvg = Math.abs(courtToSvg({ x: FIBA_DIMENSIONS.centerCircleRadius, y: 0 }, viewport).x - centerSvg.x);
    const topCenterSvg = courtToSvg({ x: 0, y: -FIBA_DIMENSIONS.courtWidth / 2 - (mode === "full" ? FIBA_DIMENSIONS.centerLineExtension : 0) }, viewport);
    const botCenterSvg = courtToSvg({ x: 0, y: FIBA_DIMENSIONS.courtWidth / 2 + (mode === "full" ? FIBA_DIMENSIONS.centerLineExtension : 0) }, viewport);

    return (
      <g data-testid="court-center">
        {/* Center line */}
        <line x1={topCenterSvg.x} y1={topCenterSvg.y} x2={botCenterSvg.x} y2={botCenterSvg.y} stroke={colors.lines} strokeWidth="2" />
        {/* Center circle */}
        {mode === "full" ? (
          <circle cx={centerSvg.x} cy={centerSvg.y} r={centerRadiusSvg} fill="none" stroke={colors.lines} strokeWidth="2" />
        ) : (
          /* Half-court semi-circle */
          <path
            d={`M ${centerSvg.x} ${centerSvg.y - centerRadiusSvg} A ${centerRadiusSvg} ${centerRadiusSvg} 0 0 1 ${centerSvg.x} ${centerSvg.y + centerRadiusSvg}`}
            fill="none"
            stroke={colors.lines}
            strokeWidth="2"
          />
        )}
      </g>
    );
  };

  // Outer Boundary
  const renderCourtBoundary = () => {
    const minX = mode === "half" ? 0 : -FIBA_DIMENSIONS.halfCourtLength;
    const maxX = FIBA_DIMENSIONS.halfCourtLength;
    const minY = -FIBA_DIMENSIONS.courtWidth / 2;
    const maxY = FIBA_DIMENSIONS.courtWidth / 2;

    const tl = courtToSvg({ x: minX, y: minY }, viewport);
    const br = courtToSvg({ x: maxX, y: maxY }, viewport);

    return (
      <rect
        x={tl.x}
        y={tl.y}
        width={br.x - tl.x}
        height={br.y - tl.y}
        fill={colors.courtFloor}
        stroke={colors.lines}
        strokeWidth="3"
        rx="2"
        data-testid="court-boundary"
      />
    );
  };

  // Optional 1-meter tactical grid
  const renderGrid = () => {
    if (!showGrid) return null;
    const lines: React.ReactNode[] = [];
    const minX = mode === "half" ? 0 : -14;
    const maxX = 14;

    for (let x = minX; x <= maxX; x += 1) {
      const top = courtToSvg({ x, y: -7.5 }, viewport);
      const bot = courtToSvg({ x, y: 7.5 }, viewport);
      lines.push(
        <line
          key={`gx-${x}`}
          x1={top.x}
          y1={top.y}
          x2={bot.x}
          y2={bot.y}
          stroke={colors.grid}
          strokeWidth="0.5"
          strokeDasharray={x === 0 ? "none" : "2 2"}
        />
      );
    }

    for (let y = -7; y <= 7; y += 1) {
      const left = courtToSvg({ x: minX, y }, viewport);
      const right = courtToSvg({ x: maxX, y }, viewport);
      lines.push(
        <line
          key={`gy-${y}`}
          x1={left.x}
          y1={left.y}
          x2={right.x}
          y2={right.y}
          stroke={colors.grid}
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
      );
    }

    return <g data-testid="court-grid">{lines}</g>;
  };

  // Dimensions Annotations (meters)
  const renderDimensionsAnnotations = () => {
    if (!showDimensions) return null;
    const baseline = courtToSvg({ x: 14.0, y: 0 }, viewport);
    const hoop = courtToSvg({ x: 14.0 - FIBA_DIMENSIONS.hoopOffsetFromBaseline, y: 0 }, viewport);
    return (
      <g data-testid="court-dimensions" fill={colors.text} fontSize="10" fontFamily="monospace">
        <text x={baseline.x - 20} y={padding - 8} textAnchor="end">FIBA Standard ({mode === "half" ? "14m × 15m" : "28m × 15m"})</text>
        <text x={hoop.x - 40} y={hoop.y - 12} textAnchor="middle">3PT (6.75m)</text>
      </g>
    );
  };

  return (
    <svg
      role="img"
      aria-label={`FIBA ${mode === "half" ? "Half" : "Full"} Basketball Court Diagram`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onClick={handleSvgClick}
      className={className}
      style={{
        backgroundColor: colors.bg,
        borderRadius: 8,
        cursor: interactive ? "crosshair" : "default",
        userSelect: "none",
        ...style,
      }}
    >
      <title>{`FIBA ${mode === "half" ? "Half" : "Full"} Court Renderer`}</title>

      {/* Main Floor & Boundaries */}
      {renderCourtBoundary()}

      {/* Optional Tactical Grid */}
      {renderGrid()}

      {/* Center court division and circle */}
      {renderCenterCourt()}

      {/* Basket & Key Features */}
      {renderBasketFeatures("right")}
      {mode === "full" && renderBasketFeatures("left")}

      {/* Optional Dimension Labels */}
      {renderDimensionsAnnotations()}

      {/* Dynamic Overlay Elements (Tokens, Paths, Annotations) */}
      {children}
    </svg>
  );
};
