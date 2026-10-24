import { AuthError } from "../identity/service.js";
import type { Db } from "../db/index.js";
import { getPractice } from "./service.js";

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderPracticePrintHtml(practice: {
  title: string;
  scheduledAt: string;
  location?: string | null | undefined;
  focus?: string | null | undefined;
  notes?: string | null | undefined;
  totalDurationMins: number;
  blocks: Array<{
    order: number;
    title: string;
    category: string;
    durationMins: number;
    notes?: string | undefined;
  }>;
  attendance?: Array<{ userId: string; name?: string | undefined; status: string }> | undefined;
}, options: { teamName?: string | undefined; headCoach?: string | undefined } = {}): string {
  const { teamName = "COURT IQ Basketball", headCoach = "Head Coach" } = options;

  let elapsedMinutes = 0;
  const blocksRows = (practice.blocks || []).map((b) => {
    const startMins = elapsedMinutes;
    elapsedMinutes += b.durationMins;
    const endMins = elapsedMinutes;

    return `
      <tr>
        <td style="width: 80px; font-weight: 700; color: #475569;">${startMins}m – ${endMins}m</td>
        <td style="width: 60px; text-align: center;"><strong>${b.durationMins}m</strong></td>
        <td>
          <div style="font-weight: 700; font-size: 13px; color: #0f172a;">${escapeXml(b.title)}</div>
          ${b.notes ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">${escapeXml(b.notes)}</div>` : ""}
        </td>
        <td style="width: 110px;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #e2e8f0; color: #334155;">
            ${escapeXml(b.category)}
          </span>
        </td>
      </tr>
    `;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(practice.title)} — Practice Plan</title>
  <style>
    @page { size: A4 portrait; margin: 1.2cm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; color: #0f172a; }
    .no-print { margin-bottom: 20px; padding: 12px; background: #f1f5f9; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .print-btn { background: #ea580c; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
    @media print { body { padding: 0; } .no-print { display: none !important; } }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; color: #1e293b; text-transform: uppercase; font-size: 11px; }
  </style>
</head>
<body>
  <div class="no-print">
    <span>Printable Practice Plan (Session Sheet)</span>
    <button class="print-btn" onclick="window.print()">Print Practice Plan</button>
  </div>
  <div style="border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div>
      <div style="font-size: 13px; font-weight: 700; color: #ea580c; text-transform: uppercase;">${escapeXml(teamName)} • Practice Session OS</div>
      <h1 style="font-size: 26px; font-weight: 800; margin: 0; color: #0f172a;">${escapeXml(practice.title)}</h1>
    </div>
    <div style="text-align: right; font-size: 11px; color: #64748b;">
      <div>Head Coach: <strong>${escapeXml(headCoach)}</strong></div>
      <div>Duration: <strong>${practice.totalDurationMins} minutes</strong></div>
    </div>
  </div>
  ${practice.focus ? `<div style="background: #f8fafc; border-left: 4px solid #ea580c; padding: 10px 14px; font-size: 13px; margin-bottom: 20px;"><strong>Primary Focus:</strong> ${escapeXml(practice.focus)}</div>` : ""}
  <table>
    <thead>
      <tr>
        <th>Timeline</th>
        <th>Duration</th>
        <th>Drill / Installation</th>
        <th>Category</th>
      </tr>
    </thead>
    <tbody>
      ${blocksRows || '<tr><td colspan="4">No blocks scheduled.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`.trim();
}

export async function exportPracticePrintHtmlById(db: Db, currentUserId: string, practiceId: string): Promise<string> {
  const practice = await getPractice(db, currentUserId, practiceId);
  if (!practice) {
    throw new AuthError(404, "Practice session not found");
  }
  return renderPracticePrintHtml(practice);
}
