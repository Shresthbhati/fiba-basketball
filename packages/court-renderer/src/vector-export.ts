import { FIBA_DIMENSIONS, type CourtMode, type CourtOrientation } from "./dimensions";
import { courtToSvg, type CourtViewport } from "./coords";
import type {
  TacticalPlay,
  TacticalKeyframe,
  TacticalToken,
  TacticalAction,
} from "./tokens";

export interface SvgExportOptions {
  width?: number;
  height?: number;
  padding?: number;
  mode?: CourtMode;
  orientation?: CourtOrientation;
  theme?: "light" | "dark" | "monochrome";
  includeLegend?: boolean;
  stepTitle?: string;
}

export interface TacticalPrintOptions {
  teamName?: string;
  authorName?: string;
  notes?: string;
  theme?: "light" | "monochrome";
}

export interface PracticePrintBlock {
  order: number;
  title: string;
  category: string;
  durationMins: number;
  intensity?: string;
  notes?: string;
  equipment?: string;
}

export interface PracticePrintData {
  title: string;
  scheduledAt: string;
  location?: string | null;
  focus?: string | null;
  notes?: string | null;
  totalDurationMins: number;
  blocks: PracticePrintBlock[];
  attendees?: Array<{ name: string; status?: string }>;
}

const THEME_COLORS = {
  light: {
    bg: "#ffffff",
    courtFloor: "#f8fafc",
    keyPaint: "#f1f5f9",
    lines: "#1e293b",
    hoop: "#ea580c",
    backboard: "#0f172a",
    offenseFill: "#0284c7",
    offenseStroke: "#0369a1",
    offenseText: "#ffffff",
    defenseFill: "#ef4444",
    defenseStroke: "#b91c1c",
    defenseText: "#ffffff",
    ballFill: "#f97316",
    ballStroke: "#9a3412",
    ballText: "#ffffff",
    cutLine: "#0284c7",
    passLine: "#ca8a04",
    dribbleLine: "#16a34a",
    screenLine: "#9333ea",
    slideLine: "#64748b",
  },
  dark: {
    bg: "#0d0e12",
    courtFloor: "#14151b",
    keyPaint: "#1b1c26",
    lines: "#cbd5e1",
    hoop: "#f97316",
    backboard: "#f8fafc",
    offenseFill: "#38bdf8",
    offenseStroke: "#0284c7",
    offenseText: "#030712",
    defenseFill: "#f87171",
    defenseStroke: "#dc2626",
    defenseText: "#030712",
    ballFill: "#fb923c",
    ballStroke: "#ea580c",
    ballText: "#030712",
    cutLine: "#38bdf8",
    passLine: "#facc15",
    dribbleLine: "#4ade80",
    screenLine: "#c084fc",
    slideLine: "#94a3b8",
  },
  monochrome: {
    bg: "#ffffff",
    courtFloor: "#ffffff",
    keyPaint: "#f8fafc",
    lines: "#000000",
    hoop: "#000000",
    backboard: "#000000",
    offenseFill: "#000000",
    offenseStroke: "#000000",
    offenseText: "#ffffff",
    defenseFill: "#ffffff",
    defenseStroke: "#000000",
    defenseText: "#000000",
    ballFill: "#e2e8f0",
    ballStroke: "#000000",
    ballText: "#000000",
    cutLine: "#000000",
    passLine: "#000000",
    dribbleLine: "#000000",
    screenLine: "#000000",
    slideLine: "#000000",
  },
};

/**
 * Escapes XML/HTML text.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates standalone SVG court lines for a specific viewport and theme.
 */
function generateCourtSvgElements(viewport: CourtViewport, theme: "light" | "dark" | "monochrome"): string {
  const c = THEME_COLORS[theme];
  const { width, height, padding = 20, mode } = viewport;
  const isHalf = mode === "half";

  const courtW = width - padding * 2;
  const courtH = height - padding * 2;

  // Basket features on the right (half court) or both sides
  const renderHalfBasket = (side: "right" | "left"): string => {
    const isRight = side === "right";
    const sign = isRight ? 1 : -1;
    const baselineX = sign * 14.0;
    const hoopX = sign * (14.0 - FIBA_DIMENSIONS.hoopOffsetFromBaseline);
    const backboardX = sign * (14.0 - FIBA_DIMENSIONS.backboardOffsetFromBaseline);
    const keyInnerX = sign * (14.0 - FIBA_DIMENSIONS.keyLength);

    const cornerY = FIBA_DIMENSIONS.threePointCornerY;
    const threePtTransitionX = sign * (14.0 - FIBA_DIMENSIONS.hoopOffsetFromBaseline - FIBA_DIMENSIONS.threePointArcDx);

    const hoopCenter = courtToSvg({ x: hoopX, y: 0 }, viewport);
    const backboardTop = courtToSvg({ x: backboardX, y: -FIBA_DIMENSIONS.backboardWidth / 2 }, viewport);
    const backboardBottom = courtToSvg({ x: backboardX, y: FIBA_DIMENSIONS.backboardWidth / 2 }, viewport);

    const keyBL = courtToSvg({ x: baselineX, y: -FIBA_DIMENSIONS.keyWidth / 2 }, viewport);
    const keyBR = courtToSvg({ x: baselineX, y: FIBA_DIMENSIONS.keyWidth / 2 }, viewport);
    const keyTL = courtToSvg({ x: keyInnerX, y: -FIBA_DIMENSIONS.keyWidth / 2 }, viewport);
    const keyTR = courtToSvg({ x: keyInnerX, y: FIBA_DIMENSIONS.keyWidth / 2 }, viewport);

    const ftCenter = courtToSvg({ x: keyInnerX, y: 0 }, viewport);
    const ftRadius = Math.abs(courtToSvg({ x: keyInnerX + FIBA_DIMENSIONS.freeThrowCircleRadius, y: 0 }, viewport).x - ftCenter.x);

    const corner3TopBase = courtToSvg({ x: baselineX, y: -cornerY }, viewport);
    const corner3TopEnd = courtToSvg({ x: threePtTransitionX, y: -cornerY }, viewport);
    const corner3BottomBase = courtToSvg({ x: baselineX, y: cornerY }, viewport);
    const corner3BottomEnd = courtToSvg({ x: threePtTransitionX, y: cornerY }, viewport);

    const threePtRadius = Math.abs(courtToSvg({ x: hoopX + (isRight ? -FIBA_DIMENSIONS.threePointRadius : FIBA_DIMENSIONS.threePointRadius), y: 0 }, viewport).x - hoopCenter.x);
    const sweepFlag = isRight ? 0 : 1;
    const arcPath = `M ${corner3TopEnd.x.toFixed(1)} ${corner3TopEnd.y.toFixed(1)} A ${threePtRadius.toFixed(1)} ${threePtRadius.toFixed(1)} 0 0 ${sweepFlag} ${corner3BottomEnd.x.toFixed(1)} ${corner3BottomEnd.y.toFixed(1)}`;

    const hoopRadius = Math.max(4, Math.abs(courtToSvg({ x: hoopX + FIBA_DIMENSIONS.hoopRadius, y: 0 }, viewport).x - hoopCenter.x));

    return `
      <!-- Key / Paint -->
      <polygon points="${keyBL.x.toFixed(1)},${keyBL.y.toFixed(1)} ${keyBR.x.toFixed(1)},${keyBR.y.toFixed(1)} ${keyTR.x.toFixed(1)},${keyTR.y.toFixed(1)} ${keyTL.x.toFixed(1)},${keyTL.y.toFixed(1)}" fill="${c.keyPaint}" stroke="${c.lines}" stroke-width="2" />
      <!-- Free Throw Circle -->
      <circle cx="${ftCenter.x.toFixed(1)}" cy="${ftCenter.y.toFixed(1)}" r="${ftRadius.toFixed(1)}" fill="none" stroke="${c.lines}" stroke-width="2" />
      <!-- 3-Point Line -->
      <line x1="${corner3TopBase.x.toFixed(1)}" y1="${corner3TopBase.y.toFixed(1)}" x2="${corner3TopEnd.x.toFixed(1)}" y2="${corner3TopEnd.y.toFixed(1)}" stroke="${c.lines}" stroke-width="2" />
      <path d="${arcPath}" fill="none" stroke="${c.lines}" stroke-width="2" />
      <line x1="${corner3BottomBase.x.toFixed(1)}" y1="${corner3BottomBase.y.toFixed(1)}" x2="${corner3BottomEnd.x.toFixed(1)}" y2="${corner3BottomEnd.y.toFixed(1)}" stroke="${c.lines}" stroke-width="2" />
      <!-- Backboard -->
      <line x1="${backboardTop.x.toFixed(1)}" y1="${backboardTop.y.toFixed(1)}" x2="${backboardBottom.x.toFixed(1)}" y2="${backboardBottom.y.toFixed(1)}" stroke="${c.backboard}" stroke-width="4" stroke-linecap="round" />
      <!-- Hoop -->
      <circle cx="${hoopCenter.x.toFixed(1)}" cy="${hoopCenter.y.toFixed(1)}" r="${hoopRadius.toFixed(1)}" fill="none" stroke="${c.hoop}" stroke-width="3" />
    `;
  };

  const centerLine = isHalf
    ? `<line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="${c.lines}" stroke-width="2" />`
    : `<line x1="${width / 2}" y1="${padding}" x2="${width / 2}" y2="${height - padding}" stroke="${c.lines}" stroke-width="2" />
       <circle cx="${width / 2}" cy="${height / 2}" r="${((width - padding * 2) * 0.12).toFixed(1)}" fill="none" stroke="${c.lines}" stroke-width="2" />`;

  return `
    <!-- Court Perimeter -->
    <rect x="${padding}" y="${padding}" width="${courtW}" height="${courtH}" rx="4" fill="${c.courtFloor}" stroke="${c.lines}" stroke-width="3" />
    <!-- Center Line / Division -->
    ${centerLine}
    <!-- Basket Markings -->
    ${renderHalfBasket("right")}
    ${!isHalf ? renderHalfBasket("left") : ""}
  `;
}

/**
 * Generates SVG path string for action paths (cuts, passes, dribbles, screens).
 */
function generateActionSvg(action: TacticalAction, viewport: CourtViewport, theme: "light" | "dark" | "monochrome"): string {
  const c = THEME_COLORS[theme];
  const from = courtToSvg(action.from, viewport);
  const to = courtToSvg(action.to, viewport);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);

  switch (action.type) {
    case "cut":
      return `
        <line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${c.cutLine}" stroke-width="2.5" marker-end="url(#marker-cut-${theme})" stroke-linecap="round" />
        ${action.label ? `<text x="${((from.x + to.x) / 2).toFixed(1)}" y="${((from.y + to.y) / 2 - 6).toFixed(1)}" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="${c.cutLine}" text-anchor="middle">${escapeXml(action.label)}</text>` : ""}
      `;
    case "pass":
      return `
        <line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${c.passLine}" stroke-width="2" stroke-dasharray="6,4" marker-end="url(#marker-pass-${theme})" stroke-linecap="round" />
        ${action.label ? `<text x="${((from.x + to.x) / 2).toFixed(1)}" y="${((from.y + to.y) / 2 - 6).toFixed(1)}" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="${c.passLine}" text-anchor="middle">${escapeXml(action.label)}</text>` : ""}
      `;
    case "dribble": {
      // Wavy zigzag dribble path
      const dist = Math.hypot(dx, dy);
      const segments = Math.max(3, Math.floor(dist / 14));
      const perpAngle = angle + Math.PI / 2;
      const amp = 4.5;

      let d = `M ${from.x.toFixed(1)} ${from.y.toFixed(1)}`;
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const cx = from.x + dx * t;
        const cy = from.y + dy * t;
        const side = i % 2 === 1 ? amp : -amp;
        const wx = cx + Math.cos(perpAngle) * side;
        const wy = cy + Math.sin(perpAngle) * side;
        d += ` L ${wx.toFixed(1)} ${wy.toFixed(1)}`;
      }
      d += ` L ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;

      return `
        <path d="${d}" fill="none" stroke="${c.dribbleLine}" stroke-width="2.5" marker-end="url(#marker-dribble-${theme})" stroke-linejoin="round" />
        ${action.label ? `<text x="${((from.x + to.x) / 2).toFixed(1)}" y="${((from.y + to.y) / 2 - 6).toFixed(1)}" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="${c.dribbleLine}" text-anchor="middle">${escapeXml(action.label)}</text>` : ""}
      `;
    }
    case "screen": {
      // Line ending in a perpendicular T-bar
      const perpLen = 8;
      const t1x = to.x + Math.cos(angle + Math.PI / 2) * perpLen;
      const t1y = to.y + Math.sin(angle + Math.PI / 2) * perpLen;
      const t2x = to.x - Math.cos(angle + Math.PI / 2) * perpLen;
      const t2y = to.y - Math.sin(angle + Math.PI / 2) * perpLen;

      return `
        <line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${c.screenLine}" stroke-width="2.5" />
        <line x1="${t1x.toFixed(1)}" y1="${t1y.toFixed(1)}" x2="${t2x.toFixed(1)}" y2="${t2y.toFixed(1)}" stroke="${c.screenLine}" stroke-width="3" stroke-linecap="square" />
        ${action.label ? `<text x="${((from.x + to.x) / 2).toFixed(1)}" y="${((from.y + to.y) / 2 - 6).toFixed(1)}" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="${c.screenLine}" text-anchor="middle">${escapeXml(action.label)}</text>` : ""}
      `;
    }
    case "slide":
    default:
      return `
        <line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${c.slideLine}" stroke-width="2" stroke-dasharray="3,3" />
      `;
  }
}

/**
 * Generates SVG element for player tokens.
 */
function generateTokenSvg(token: TacticalToken, viewport: CourtViewport, theme: "light" | "dark" | "monochrome"): string {
  const c = THEME_COLORS[theme];
  const pos = courtToSvg({ x: token.x, y: token.y }, viewport);
  const r = token.type === "ball" ? 10 : 13;

  let fill = c.offenseFill;
  let stroke = c.offenseStroke;
  let textColor = c.offenseText;

  if (token.type === "defense") {
    fill = c.defenseFill;
    stroke = c.defenseStroke;
    textColor = c.defenseText;
  } else if (token.type === "ball") {
    fill = c.ballFill;
    stroke = c.ballStroke;
    textColor = c.ballText;
  }

  const isBall = token.type === "ball";

  return `
    <g class="tactical-token" data-token-id="${escapeXml(token.id)}">
      <circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" />
      ${
        isBall
          ? `<path d="M ${(pos.x - 7).toFixed(1)} ${pos.y.toFixed(1)} Q ${pos.x.toFixed(1)} ${(pos.y - 6).toFixed(1)} ${(pos.x + 7).toFixed(1)} ${pos.y.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1.2" />
             <path d="M ${(pos.x - 7).toFixed(1)} ${pos.y.toFixed(1)} Q ${pos.x.toFixed(1)} ${(pos.y + 6).toFixed(1)} ${(pos.x + 7).toFixed(1)} ${pos.y.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1.2" />`
          : `<text x="${pos.x.toFixed(1)}" y="${(pos.y + 4.5).toFixed(1)}" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="${textColor}" text-anchor="middle">${escapeXml(token.label)}</text>`
      }
    </g>
  `;
}

/**
 * Generates a complete standalone SVG document for a tactical keyframe.
 */
export function exportPlayKeyframeToSvg(
  keyframe: TacticalKeyframe,
  options: SvgExportOptions = {},
): string {
  const {
    width = 700,
    height = 500,
    padding = 24,
    mode = "half",
    orientation = "horizontal",
    theme = "light",
    includeLegend = true,
    stepTitle,
  } = options;

  const viewport: CourtViewport = {
    width,
    height,
    padding,
    mode,
    orientation,
  };

  const c = THEME_COLORS[theme];

  const markerDefs = `
    <defs>
      <marker id="marker-cut-${theme}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="${c.cutLine}" />
      </marker>
      <marker id="marker-pass-${theme}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="${c.passLine}" />
      </marker>
      <marker id="marker-dribble-${theme}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="${c.dribbleLine}" />
      </marker>
    </defs>
  `;

  const courtSvg = generateCourtSvgElements(viewport, theme);
  const actionsSvg = (keyframe.actions || []).map((a) => generateActionSvg(a, viewport, theme)).join("\n");
  const tokensSvg = (keyframe.tokens || []).map((t) => generateTokenSvg(t, viewport, theme)).join("\n");

  const titleHeader = stepTitle
    ? `<text x="${padding}" y="${padding - 8}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="${c.lines}">${escapeXml(stepTitle)}</text>`
    : "";

  const legend = includeLegend
    ? `
      <g transform="translate(${padding}, ${height - 8})">
        <text font-family="system-ui, sans-serif" font-size="9" fill="${c.lines}" font-weight="600">
          LEGEND: ── Cut (Blue)   ┈┈┈ Pass (Gold)   ∿∿∿ Dribble (Green)   ┬ Screen (Purple)
        </text>
      </g>
    `
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: ${c.bg}; font-family: system-ui, -apple-system, sans-serif;">
  ${markerDefs}
  ${titleHeader}
  <g class="court-structure">
    ${courtSvg}
  </g>
  <g class="actions-layer">
    ${actionsSvg}
  </g>
  <g class="tokens-layer">
    ${tokensSvg}
  </g>
  ${legend}
</svg>`.trim();
}

/**
 * Generates a multi-frame composite SVG containing all steps of a tactical play.
 */
export function exportPlayToMultiFrameSvg(
  play: TacticalPlay,
  options: { theme?: "light" | "dark" | "monochrome"; frameWidth?: number; frameHeight?: number } = {},
): string {
  const { theme = "light", frameWidth = 460, frameHeight = 330 } = options;
  const c = THEME_COLORS[theme];
  const frames = play.keyframes || [];
  const count = frames.length || 1;

  // Lay out in 2 columns
  const cols = count > 1 ? 2 : 1;
  const rows = Math.ceil(count / cols);
  const gap = 20;
  const totalW = cols * frameWidth + (cols + 1) * gap;
  const headerH = 70;
  const totalH = headerH + rows * frameHeight + (rows + 1) * gap;

  let frameElements = "";
  frames.forEach((kf, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = gap + col * (frameWidth + gap);
    const y = headerH + gap + row * (frameHeight + gap);

    const frameSvgInner = exportPlayKeyframeToSvg(kf, {
      width: frameWidth,
      height: frameHeight - 30,
      padding: 18,
      mode: play.courtMode,
      theme,
      includeLegend: false,
      stepTitle: `Step ${kf.step}: ${kf.description.slice(0, 48)}...`,
    });

    // Strip <?xml ...> and root <svg> wrappers to embed
    const innerContent = frameSvgInner.replace(/<\?xml.*?\?>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>$/, "");

    frameElements += `
      <g transform="translate(${x}, ${y})">
        <!-- Frame Box -->
        <rect width="${frameWidth}" height="${frameHeight}" rx="8" fill="${c.courtFloor}" stroke="${c.lines}" stroke-width="1" />
        <text x="12" y="20" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="${c.lines}">Frame ${kf.step}: ${escapeXml(kf.description.slice(0, 50))}</text>
        <g transform="translate(0, 24)">
          ${innerContent}
        </g>
      </g>
    `;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" style="background-color: ${c.bg}; font-family: system-ui, -apple-system, sans-serif;">
  <g class="header" transform="translate(${gap}, 28)">
    <text font-family="system-ui, sans-serif" font-size="18" font-weight="800" fill="${c.lines}">COURT IQ Tactical Playbook: ${escapeXml(play.title)}</text>
    <text y="22" font-family="system-ui, sans-serif" font-size="12" fill="${c.lines}" opacity="0.8">Category: ${escapeXml(play.category.toUpperCase())} • Mode: ${escapeXml(play.courtMode.toUpperCase())} COURT • Version: ${play.version}</text>
  </g>
  ${frameElements}
</svg>`.trim();
}

/**
 * Generates an executive print-ready HTML playbook coaching sheet (Spec §10.3).
 */
export function generateTacticalPlaybookPrintHtml(
  play: TacticalPlay,
  options: TacticalPrintOptions = {},
): string {
  const { teamName = "COURT IQ Basketball", authorName = "Coaching Staff", notes, theme = "light" } = options;

  // Generate SVG markup for each frame
  const framesHtml = (play.keyframes || []).map((kf) => {
    const svgMarkup = exportPlayKeyframeToSvg(kf, {
      width: 580,
      height: 410,
      padding: 20,
      mode: play.courtMode,
      theme,
      includeLegend: true,
      stepTitle: `Frame ${kf.step}`,
    });

    return `
      <div class="frame-card">
        <div class="frame-header">
          <span class="frame-step-badge">STEP ${kf.step}</span>
          <span class="frame-desc">${escapeXml(kf.description)}</span>
        </div>
        <div class="frame-svg-container">
          ${svgMarkup}
        </div>
      </div>
    `;
  }).join("\n");

  // Collect distinct player tokens
  const tokenLabels = new Set<string>();
  (play.keyframes || []).forEach((kf) => {
    (kf.tokens || []).forEach((t) => {
      if (t.type === "offense") tokenLabels.add(t.label);
    });
  });
  const sortedTokens = Array.from(tokenLabels).sort();

  const tokenAssignmentsRows = sortedTokens.map((lbl) => {
    const stepsDesc = (play.keyframes || []).map((kf) => {
      const act = (kf.actions || []).find((a) => {
        const matchingToken = (kf.tokens || []).find((tok) => tok.label === lbl);
        if (!matchingToken) return false;
        return Math.hypot(a.from.x - matchingToken.x, a.from.y - matchingToken.y) < 1.0;
      });
      return `<strong>Step ${kf.step}:</strong> ${act ? `${act.type.toUpperCase()} (${act.label || "movement"})` : "Spacing / Spot-up"}`;
    }).join(" • ");

    return `
      <tr>
        <td class="player-cell"><strong>Player ${escapeXml(lbl)}</strong></td>
        <td>${stepsDesc}</td>
      </tr>
    `;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(play.title)} — Tactical Playbook</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 1.2cm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      color: #0f172a;
      background: #ffffff;
    }
    .no-print {
      margin-bottom: 20px;
      padding: 12px 16px;
      background: #f1f5f9;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .print-btn {
      background: #ea580c;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      .page-break { page-break-after: always; }
    }
    .header {
      border-bottom: 3px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .team-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #ea580c;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .play-title {
      font-size: 26px;
      font-weight: 800;
      margin: 0;
      color: #0f172a;
    }
    .meta-tags {
      text-align: right;
      font-size: 11px;
      color: #64748b;
    }
    .tag-badge {
      display: inline-block;
      background: #e2e8f0;
      color: #1e293b;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      margin-left: 4px;
    }
    .description-box {
      background: #f8fafc;
      border-left: 4px solid #ea580c;
      padding: 10px 14px;
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .frames-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .frame-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .frame-header {
      background: #f1f5f9;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #cbd5e1;
    }
    .frame-step-badge {
      background: #0f172a;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
    }
    .frame-desc {
      font-size: 12px;
      color: #334155;
      font-weight: 500;
    }
    .frame-svg-container {
      padding: 12px;
      display: flex;
      justify-content: center;
      background: #ffffff;
    }
    .frame-svg-container svg {
      max-width: 100%;
      height: auto;
    }
    .table-section {
      margin-top: 24px;
      page-break-inside: avoid;
    }
    .section-heading {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0f172a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
    }
    .player-cell {
      width: 120px;
      background: #f8fafc;
    }
    .coaching-cues {
      background: #fffbeb;
      border: 1px solid #fde68a;
      padding: 12px;
      border-radius: 6px;
      font-size: 12px;
      color: #92400e;
      margin-top: 20px;
      page-break-inside: avoid;
    }
    .footer {
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <span>Tactical Playbook Coaching Sheet Ready for Print / PDF Export</span>
    <button class="print-btn" onclick="window.print()">Print Playbook Sheet</button>
  </div>

  <div class="header">
    <div>
      <div class="team-title">${escapeXml(teamName)} • Playbook System</div>
      <h1 class="play-title">${escapeXml(play.title)}</h1>
    </div>
    <div class="meta-tags">
      <div>Author: <strong>${escapeXml(authorName)}</strong></div>
      <div>Date: ${new Date().toLocaleDateString(undefined, { dateStyle: "long" })}</div>
      <div style="margin-top: 4px;">
        <span class="tag-badge">${escapeXml(play.category)}</span>
        <span class="tag-badge">${escapeXml(play.courtMode)} court</span>
        ${(play.tags || []).map((t) => `<span class="tag-badge">#${escapeXml(t)}</span>`).join("")}
      </div>
    </div>
  </div>

  ${play.description ? `<div class="description-box"><strong>Play Objective & Setup:</strong> ${escapeXml(play.description)}</div>` : ""}

  <div class="frames-grid">
    ${framesHtml}
  </div>

  <div class="table-section">
    <div class="section-heading">Player Responsibilities by Step</div>
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th>Assignments & Action Sequence</th>
        </tr>
      </thead>
      <tbody>
        ${tokenAssignmentsRows || '<tr><td colspan="2">Standard 5-out horns motion assignments.</td></tr>'}
      </tbody>
    </table>
  </div>

  ${notes ? `
    <div class="coaching-cues">
      <strong>Coaching Points & Reads:</strong><br />
      ${escapeXml(notes)}
    </div>
  ` : ""}

  <div class="footer">
    <span>COURT IQ Basketball Intelligence • Spec §10.3 Vector Playbook System</span>
    <span>Confidential — For Team Coaching Use Only</span>
  </div>
</body>
</html>`.trim();
}

/**
 * Generates an executive print-ready HTML practice plan sheet (Spec §10.4).
 */
export function generatePracticePlanPrintHtml(
  practice: PracticePrintData,
  options: { teamName?: string; headCoach?: string } = {},
): string {
  const { teamName = "COURT IQ Basketball", headCoach = "Head Coach" } = options;

  let elapsedMinutes = 0;
  const blocksRows = (practice.blocks || []).map((b) => {
    const startMins = elapsedMinutes;
    elapsedMinutes += b.durationMins;
    const endMins = elapsedMinutes;

    const formatMins = (m: number) => {
      const hrs = Math.floor(m / 60);
      const rem = m % 60;
      return `${hrs > 0 ? `${hrs}h ` : ""}${rem}m`;
    };

    return `
      <tr>
        <td style="width: 80px; font-weight: 700; color: #475569;">${formatMins(startMins)} – ${formatMins(endMins)}</td>
        <td style="width: 60px; text-align: center;"><strong>${b.durationMins}m</strong></td>
        <td>
          <div style="font-weight: 700; font-size: 13px; color: #0f172a;">${escapeXml(b.title)}</div>
          ${b.notes ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">${escapeXml(b.notes)}</div>` : ""}
          ${b.equipment ? `<div style="font-size: 10px; color: #ea580c; margin-top: 2px;">Equip: ${escapeXml(b.equipment)}</div>` : ""}
        </td>
        <td style="width: 110px;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #e2e8f0; color: #334155;">
            ${escapeXml(b.category)}
          </span>
        </td>
        <td style="width: 80px; text-align: center;">
          <span style="font-size: 10px; font-weight: 700; color: ${b.intensity === "HIGH" ? "#b91c1c" : b.intensity === "LOW" ? "#15803d" : "#b45309"};">
            ${escapeXml(b.intensity || "MEDIUM")}
          </span>
        </td>
      </tr>
    `;
  }).join("\n");

  const attendeesRows = (practice.attendees || []).map((att) => {
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
        <span>${escapeXml(att.name)}</span>
        <span style="font-weight: 600; color: #475569;">[  ] ${escapeXml(att.status || "PRESENT")}</span>
      </div>
    `;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(practice.title)} — Practice Plan</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 1.2cm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      color: #0f172a;
      background: #ffffff;
    }
    .no-print {
      margin-bottom: 20px;
      padding: 12px 16px;
      background: #f1f5f9;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .print-btn {
      background: #ea580c;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      .page-break { page-break-after: always; }
    }
    .header {
      border-bottom: 3px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .team-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #ea580c;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .practice-title {
      font-size: 26px;
      font-weight: 800;
      margin: 0;
      color: #0f172a;
    }
    .meta-box {
      text-align: right;
      font-size: 11px;
      color: #64748b;
    }
    .focus-banner {
      background: #f8fafc;
      border-left: 4px solid #ea580c;
      padding: 10px 14px;
      font-size: 13px;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 24px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
      font-size: 11px;
    }
    .attendance-section {
      margin-top: 20px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px;
      page-break-inside: avoid;
    }
    .footer {
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <span>Printable Practice Plan (Clipboard & Session Sheet)</span>
    <button class="print-btn" onclick="window.print()">Print Practice Plan</button>
  </div>

  <div class="header">
    <div>
      <div class="team-title">${escapeXml(teamName)} • Practice Session OS</div>
      <h1 class="practice-title">${escapeXml(practice.title)}</h1>
    </div>
    <div class="meta-box">
      <div>Head Coach: <strong>${escapeXml(headCoach)}</strong></div>
      <div>Date: <strong>${new Date(practice.scheduledAt).toLocaleDateString(undefined, { dateStyle: "full" })}</strong></div>
      <div>Location: <strong>${escapeXml(practice.location || "Main Hardwood Court")}</strong></div>
      <div>Total Duration: <strong>${practice.totalDurationMins} minutes</strong></div>
    </div>
  </div>

  ${practice.focus ? `<div class="focus-banner"><strong>Primary Session Focus:</strong> ${escapeXml(practice.focus)}</div>` : ""}

  <table>
    <thead>
      <tr>
        <th>Timeline</th>
        <th>Duration</th>
        <th>Drill / Tactical Installation</th>
        <th>Category</th>
        <th>Intensity</th>
      </tr>
    </thead>
    <tbody>
      ${blocksRows || '<tr><td colspan="5">No practice drill blocks scheduled.</td></tr>'}
    </tbody>
  </table>

  ${practice.attendees && practice.attendees.length > 0 ? `
    <div class="attendance-section">
      <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; margin-bottom: 8px;">Roster Attendance Check-Off</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
        ${attendeesRows}
      </div>
    </div>
  ` : ""}

  <div class="footer">
    <span>COURT IQ Coach OS • Spec §10.4 Practice Plan Generator</span>
    <span>Bring to Practice Session • Confidential</span>
  </div>
</body>
</html>`.trim();
}
