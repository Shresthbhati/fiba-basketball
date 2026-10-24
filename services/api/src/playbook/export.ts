import { AuthError } from "../identity/service.js";
import type { Db } from "../db/index.js";
import { getTacticalPlay } from "./service.js";

export interface SvgExportOptions {
  width?: number | undefined;
  height?: number | undefined;
  padding?: number | undefined;
  theme?: "light" | "dark" | "monochrome" | undefined;
  step?: number | undefined;
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

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function courtToSvg(courtPt: { x: number; y: number }, width: number, height: number, pad: number): { x: number; y: number } {
  const drawW = width - pad * 2;
  const drawH = height - pad * 2;
  // Half court horizontal bounds: X in [0, 14], Y in [-7.5, 7.5]
  const scaleX = drawW / 14.0;
  const scaleY = drawH / 15.0;

  return {
    x: pad + courtPt.x * scaleX,
    y: pad + (courtPt.y + 7.5) * scaleY,
  };
}

export function renderPlaySvg(play: {
  title: string;
  category: string;
  courtMode: string;
  keyframes: Array<{
    step: number;
    description: string;
    tokens: Array<{ id: string; type: string; label: string; x: number; y: number }>;
    actions: Array<{ id: string; type: string; from: { x: number; y: number }; to: { x: number; y: number }; label?: string | undefined }>;
  }>;
}, options: SvgExportOptions = {}): string {
  const { width = 700, height = 500, padding = 24, theme = "light", step } = options;
  const c = THEME_COLORS[theme];

  const targetKf = step
    ? play.keyframes.find((k) => k.step === step) || play.keyframes[0]
    : play.keyframes[0];

  if (!targetKf) {
    throw new AuthError(400, "Play contains no keyframes to export");
  }

  const courtW = width - padding * 2;
  const courtH = height - padding * 2;

  // Basket features on the right
  const hoopCenter = courtToSvg({ x: 14.0 - 1.575, y: 0 }, width, height, padding);
  const backboardTop = courtToSvg({ x: 14.0 - 1.2, y: -0.9 }, width, height, padding);
  const backboardBottom = courtToSvg({ x: 14.0 - 1.2, y: 0.9 }, width, height, padding);

  const keyBL = courtToSvg({ x: 14.0, y: -2.45 }, width, height, padding);
  const keyBR = courtToSvg({ x: 14.0, y: 2.45 }, width, height, padding);
  const keyTL = courtToSvg({ x: 14.0 - 5.8, y: -2.45 }, width, height, padding);
  const keyTR = courtToSvg({ x: 14.0 - 5.8, y: 2.45 }, width, height, padding);

  const ftCenter = courtToSvg({ x: 14.0 - 5.8, y: 0 }, width, height, padding);
  const ftRadius = Math.abs(courtToSvg({ x: 14.0 - 5.8 + 1.8, y: 0 }, width, height, padding).x - ftCenter.x);

  const corner3TopBase = courtToSvg({ x: 14.0, y: -6.6 }, width, height, padding);
  const corner3TopEnd = courtToSvg({ x: 14.0 - 1.575 - 1.425, y: -6.6 }, width, height, padding);
  const corner3BottomBase = courtToSvg({ x: 14.0, y: 6.6 }, width, height, padding);
  const corner3BottomEnd = courtToSvg({ x: 14.0 - 1.575 - 1.425, y: 6.6 }, width, height, padding);

  const threePtRadius = Math.abs(courtToSvg({ x: 14.0 - 1.575 - 6.75, y: 0 }, width, height, padding).x - hoopCenter.x);
  const arcPath = `M ${corner3TopEnd.x.toFixed(1)} ${corner3TopEnd.y.toFixed(1)} A ${threePtRadius.toFixed(1)} ${threePtRadius.toFixed(1)} 0 0 0 ${corner3BottomEnd.x.toFixed(1)} ${corner3BottomEnd.y.toFixed(1)}`;

  const hoopRadius = Math.max(4, Math.abs(courtToSvg({ x: 14.0 - 1.575 + 0.225, y: 0 }, width, height, padding).x - hoopCenter.x));

  // Render tokens
  const tokensSvg = (targetKf.tokens || []).map((t) => {
    const pos = courtToSvg(t, width, height, padding);
    const r = t.type === "ball" ? 10 : 13;
    let fill = c.offenseFill;
    let stroke = c.offenseStroke;
    let textColor = c.offenseText;

    if (t.type === "defense") {
      fill = c.defenseFill;
      stroke = c.defenseStroke;
      textColor = c.defenseText;
    } else if (t.type === "ball") {
      fill = c.ballFill;
      stroke = c.ballStroke;
      textColor = c.ballText;
    }

    return `
      <g class="token" data-token-id="${escapeXml(t.id)}">
        <circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" />
        ${
          t.type === "ball"
            ? ""
            : `<text x="${pos.x.toFixed(1)}" y="${(pos.y + 4.5).toFixed(1)}" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="${textColor}" text-anchor="middle">${escapeXml(t.label)}</text>`
        }
      </g>
    `;
  }).join("\n");

  // Render actions
  const actionsSvg = (targetKf.actions || []).map((a) => {
    const from = courtToSvg(a.from, width, height, padding);
    const to = courtToSvg(a.to, width, height, padding);
    let stroke = c.cutLine;
    let dash = "";
    if (a.type === "pass") {
      stroke = c.passLine;
      dash = 'stroke-dasharray="6,4"';
    } else if (a.type === "dribble") {
      stroke = c.dribbleLine;
    } else if (a.type === "screen") {
      stroke = c.screenLine;
    }

    return `
      <line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${stroke}" stroke-width="2.5" ${dash} stroke-linecap="round" />
      ${a.label ? `<text x="${((from.x + to.x) / 2).toFixed(1)}" y="${((from.y + to.y) / 2 - 6).toFixed(1)}" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="${stroke}" text-anchor="middle">${escapeXml(a.label)}</text>` : ""}
    `;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: ${c.bg}; font-family: system-ui, -apple-system, sans-serif;">
  <g class="court">
    <rect x="${padding}" y="${padding}" width="${courtW}" height="${courtH}" rx="4" fill="${c.courtFloor}" stroke="${c.lines}" stroke-width="3" />
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="${c.lines}" stroke-width="2" />
    <polygon points="${keyBL.x.toFixed(1)},${keyBL.y.toFixed(1)} ${keyBR.x.toFixed(1)},${keyBR.y.toFixed(1)} ${keyTR.x.toFixed(1)},${keyTR.y.toFixed(1)} ${keyTL.x.toFixed(1)},${keyTL.y.toFixed(1)}" fill="${c.keyPaint}" stroke="${c.lines}" stroke-width="2" />
    <circle cx="${ftCenter.x.toFixed(1)}" cy="${ftCenter.y.toFixed(1)}" r="${ftRadius.toFixed(1)}" fill="none" stroke="${c.lines}" stroke-width="2" />
    <line x1="${corner3TopBase.x.toFixed(1)}" y1="${corner3TopBase.y.toFixed(1)}" x2="${corner3TopEnd.x.toFixed(1)}" y2="${corner3TopEnd.y.toFixed(1)}" stroke="${c.lines}" stroke-width="2" />
    <path d="${arcPath}" fill="none" stroke="${c.lines}" stroke-width="2" />
    <line x1="${corner3BottomBase.x.toFixed(1)}" y1="${corner3BottomBase.y.toFixed(1)}" x2="${corner3BottomEnd.x.toFixed(1)}" y2="${corner3BottomEnd.y.toFixed(1)}" stroke="${c.lines}" stroke-width="2" />
    <line x1="${backboardTop.x.toFixed(1)}" y1="${backboardTop.y.toFixed(1)}" x2="${backboardBottom.x.toFixed(1)}" y2="${backboardBottom.y.toFixed(1)}" stroke="${c.backboard}" stroke-width="4" stroke-linecap="round" />
    <circle cx="${hoopCenter.x.toFixed(1)}" cy="${hoopCenter.y.toFixed(1)}" r="${hoopRadius.toFixed(1)}" fill="none" stroke="${c.hoop}" stroke-width="3" />
  </g>
  <g class="actions">${actionsSvg}</g>
  <g class="tokens">${tokensSvg}</g>
</svg>`.trim();
}

export function renderPlayPrintHtml(play: {
  title: string;
  description?: string | null | undefined;
  category: string;
  courtMode: string;
  tags?: string[] | undefined;
  keyframes: Array<{
    step: number;
    description: string;
    tokens: Array<{ id: string; type: string; label: string; x: number; y: number }>;
    actions: Array<{ id: string; type: string; from: { x: number; y: number }; to: { x: number; y: number }; label?: string | undefined }>;
  }>;
}, options: { teamName?: string; authorName?: string } = {}): string {
  const { teamName = "COURT IQ Basketball", authorName = "Coaching Staff" } = options;

  const framesHtml = (play.keyframes || []).map((kf) => {
    const svg = renderPlaySvg(play, { width: 560, height: 380, step: kf.step, theme: "light" });
    return `
      <div style="border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid; overflow: hidden;">
        <div style="background: #f1f5f9; padding: 8px 14px; font-weight: 700; font-size: 13px; color: #1e293b; border-bottom: 1px solid #cbd5e1;">
          Step ${kf.step}: ${escapeXml(kf.description)}
        </div>
        <div style="padding: 12px; display: flex; justify-content: center; background: #ffffff;">
          ${svg}
        </div>
      </div>
    `;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(play.title)} — Tactical Playbook</title>
  <style>
    @page { size: A4 portrait; margin: 1.2cm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; color: #0f172a; }
    .no-print { margin-bottom: 20px; padding: 12px; background: #f1f5f9; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .print-btn { background: #ea580c; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
    @media print { body { padding: 0; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print">
    <span>Tactical Playbook Coaching Sheet</span>
    <button class="print-btn" onclick="window.print()">Print Playbook Sheet</button>
  </div>
  <div style="border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div>
      <div style="font-size: 13px; font-weight: 700; color: #ea580c; text-transform: uppercase;">${escapeXml(teamName)} • Playbook System</div>
      <h1 style="font-size: 26px; font-weight: 800; margin: 0; color: #0f172a;">${escapeXml(play.title)}</h1>
    </div>
    <div style="text-align: right; font-size: 11px; color: #64748b;">
      <div>Author: <strong>${escapeXml(authorName)}</strong></div>
      <div>Category: <strong>${escapeXml(play.category.toUpperCase())}</strong> • Mode: <strong>${escapeXml(play.courtMode.toUpperCase())}</strong></div>
    </div>
  </div>
  ${play.description ? `<div style="background: #f8fafc; border-left: 4px solid #ea580c; padding: 10px 14px; font-size: 13px; margin-bottom: 20px;"><strong>Play Objective:</strong> ${escapeXml(play.description)}</div>` : ""}
  <div>${framesHtml}</div>
</body>
</html>`.trim();
}

export async function exportPlaySvgById(db: Db, playId: string, currentUserId: string, options: SvgExportOptions = {}): Promise<string> {
  const play = await getTacticalPlay(db, playId, currentUserId);
  if (!play) {
    throw new AuthError(404, "Play not found");
  }
  return renderPlaySvg(play, options);
}

export async function exportPlayPrintHtmlById(db: Db, playId: string, currentUserId: string): Promise<string> {
  const play = await getTacticalPlay(db, playId, currentUserId);
  if (!play) {
    throw new AuthError(404, "Play not found");
  }
  return renderPlayPrintHtml(play);
}
