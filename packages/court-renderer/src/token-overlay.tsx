import React from "react";
import { courtToSvg, type CourtViewport } from "./coords";
import type { TacticalToken, TacticalAction } from "./tokens";

export interface TokenOverlayProps {
  tokens: TacticalToken[];
  actions?: TacticalAction[];
  viewport: CourtViewport;
  selectedTokenId?: string | null;
  onSelectToken?: (token: TacticalToken) => void;
  interactive?: boolean;
}

export const TokenOverlay: React.FC<TokenOverlayProps> = ({
  tokens,
  actions = [],
  viewport,
  selectedTokenId,
  onSelectToken,
  interactive = false,
}) => {
  return (
    <g data-testid="tactical-token-overlay">
      {/* SVG Marker Definitions for Arrows and T-Bars */}
      <defs>
        {/* Solid Arrow for Cut */}
        <marker
          id="arrow-solid"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
        </marker>

        {/* Dashed Arrow for Pass */}
        <marker
          id="arrow-pass"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#facc15" />
        </marker>

        {/* Dribble Arrow */}
        <marker
          id="arrow-dribble"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#4ade80" />
        </marker>
      </defs>

      {/* Render Action Paths first (below tokens) */}
      {actions.map((act) => (
        <ActionPathItem key={act.id} action={act} viewport={viewport} />
      ))}

      {/* Render Tokens */}
      {tokens.map((token) => (
        <TokenItem
          key={token.id}
          token={token}
          viewport={viewport}
          isSelected={selectedTokenId === token.id}
          onSelect={onSelectToken}
          interactive={interactive}
        />
      ))}
    </g>
  );
};

export interface TokenItemProps {
  token: TacticalToken;
  viewport: CourtViewport;
  isSelected?: boolean;
  onSelect?: (token: TacticalToken) => void;
  interactive?: boolean;
}

export const TokenItem: React.FC<TokenItemProps> = ({
  token,
  viewport,
  isSelected = false,
  onSelect,
  interactive = false,
}) => {
  const pt = courtToSvg({ x: token.x, y: token.y }, viewport);
  const radius = token.type === "ball" ? 10 : 16;

  // Colors based on token role
  const styles = {
    offense: {
      fill: "#f97316", // Court IQ orange
      stroke: isSelected ? "#38bdf8" : "#ffffff",
      strokeWidth: isSelected ? 3 : 2,
      textColor: "#ffffff",
    },
    defense: {
      fill: "#dc2626", // Red
      stroke: isSelected ? "#38bdf8" : "#fca5a5",
      strokeWidth: isSelected ? 3 : 2,
      textColor: "#ffffff",
    },
    ball: {
      fill: "#ea580c",
      stroke: "#0f172a",
      strokeWidth: 2,
      textColor: "#0f172a",
    },
  }[token.type];

  return (
    <g
      data-testid={`token-${token.id}`}
      transform={`translate(${pt.x}, ${pt.y})`}
      onClick={(e) => {
        if (interactive && onSelect) {
          e.stopPropagation();
          onSelect(token);
        }
      }}
      style={{ cursor: interactive ? "pointer" : "default" }}
    >
      {/* Outer selection ring if active */}
      {isSelected && (
        <circle r={radius + 5} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" opacity="0.9" />
      )}

      {/* Main Token Body */}
      {token.type === "ball" ? (
        <>
          <circle r={radius} fill={styles.fill} stroke={styles.stroke} strokeWidth={styles.strokeWidth} />
          {/* Basketball Seams */}
          <line x1={-radius} y1="0" x2={radius} y2="0" stroke="#000" strokeWidth="1" />
          <path d={`M 0 ${-radius} A ${radius} ${radius} 0 0 0 0 ${radius}`} fill="none" stroke="#000" strokeWidth="1" />
        </>
      ) : (
        <circle r={radius} fill={styles.fill} stroke={styles.stroke} strokeWidth={styles.strokeWidth} />
      )}

      {/* Label (e.g. 1, 2, PG, x1, x2) */}
      {token.type !== "ball" && (
        <text
          y="4.5"
          textAnchor="middle"
          fill={styles.textColor}
          fontSize="12"
          fontWeight="bold"
          fontFamily="system-ui, sans-serif"
          pointerEvents="none"
        >
          {token.label}
        </text>
      )}
    </g>
  );
};

export const ActionPathItem: React.FC<{ action: TacticalAction; viewport: CourtViewport }> = ({
  action,
  viewport,
}) => {
  const p1 = courtToSvg(action.from, viewport);
  const p2 = courtToSvg(action.to, viewport);

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 2) return null;

  // Angle in radians
  const angle = Math.atan2(dy, dx);

  switch (action.type) {
    case "cut": // Solid line with arrow
      return (
        <line
          data-testid={`action-cut-${action.id}`}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke="#38bdf8"
          strokeWidth="2.5"
          markerEnd="url(#arrow-solid)"
        />
      );

    case "pass": // Dashed line with arrow
      return (
        <line
          data-testid={`action-pass-${action.id}`}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke="#facc15"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          markerEnd="url(#arrow-pass)"
        />
      );

    case "screen": { // Solid line ending in a perpendicular T-bar
      const tBarLen = 14;
      // Perpendicular unit vector: (-sin(angle), cos(angle))
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);

      const t1x = p2.x + perpX * tBarLen;
      const t1y = p2.y + perpY * tBarLen;
      const t2x = p2.x - perpX * tBarLen;
      const t2y = p2.y - perpY * tBarLen;

      return (
        <g data-testid={`action-screen-${action.id}`}>
          {/* Stem */}
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#a855f7" strokeWidth="2.5" />
          {/* T-Bar Crossbar */}
          <line x1={t1x} y1={t1y} x2={t2x} y2={t2y} stroke="#a855f7" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    }

    case "dribble": { // Wavy / sinusoid line
      const waves = Math.max(3, Math.floor(len / 18));
      const amp = 6;
      let pathD = `M ${p1.x} ${p1.y}`;

      const uX = dx / len;
      const uY = dy / len;
      const nX = -uY;
      const nY = uX;

      for (let i = 1; i <= waves; i++) {
        const segLen = len / waves;
        const curDist = (i - 0.5) * segLen;
        const sign = i % 2 === 0 ? 1 : -1;
        const cpX = p1.x + uX * curDist + nX * (amp * sign);
        const cpY = p1.y + uY * curDist + nY * (amp * sign);
        const epX = p1.x + uX * (i * segLen);
        const epY = p1.y + uY * (i * segLen);
        pathD += ` Q ${cpX} ${cpY} ${epX} ${epY}`;
      }

      return (
        <path
          data-testid={`action-dribble-${action.id}`}
          d={pathD}
          fill="none"
          stroke="#4ade80"
          strokeWidth="2.5"
          markerEnd="url(#arrow-dribble)"
        />
      );
    }

    case "slide": // Defensive slide double parallel line
      return (
        <line
          data-testid={`action-slide-${action.id}`}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke="#f43f5e"
          strokeWidth="3"
          strokeDasharray="3 3"
        />
      );

    default:
      return null;
  }
};
