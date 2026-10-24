"use client";

import React, { useState } from "react";
import { generatePracticePlanPrintHtml } from "@courtiq/court-renderer";
import { Dialog, Button } from "@courtiq/design-system";
import type { PracticeSession } from "./practice-planner";

export interface PracticeExportModalProps {
  open: boolean;
  onClose: () => void;
  practice: PracticeSession;
}

export function PracticeExportModal({
  open,
  onClose,
  practice,
}: PracticeExportModalProps) {
  const [includeAttendance, setIncludeAttendance] = useState(true);

  const handlePrintSession = () => {
    const attendees = includeAttendance
      ? practice.attendance.map((a) => ({
          name: a.name || `Player ${a.userId.slice(0, 5)}`,
          status: a.status,
        }))
      : undefined;

    const html = generatePracticePlanPrintHtml(
      {
        title: practice.title,
        scheduledAt: practice.scheduledAt,
        location: practice.location,
        focus: practice.focus,
        notes: practice.notes,
        totalDurationMins: practice.totalDurationMins,
        blocks: practice.blocks.map((b) => ({
          order: b.order,
          title: b.title,
          category: b.category,
          durationMins: b.durationMins,
          notes: b.notes,
        })),
        attendees,
      },
      {
        teamName: "COURT IQ Basketball",
        headCoach: "Head Coach",
      },
    );

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Export Practice Plan (Spec §10.4)">
      <div className="space-y-4 text-sm text-neutral-200">
        <div>
          <h3 className="font-bold text-white text-base">{practice.title}</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            {practice.blocks.length} drill blocks • Total Duration: {practice.totalDurationMins} minutes
          </p>
        </div>

        <div className="rounded-lg bg-neutral-900 p-3 border border-neutral-800 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-200">
            <input
              type="checkbox"
              checked={includeAttendance}
              onChange={(e) => setIncludeAttendance(e.target.checked)}
              className="rounded border-neutral-700 bg-neutral-950 text-orange-500"
            />
            Include Roster Attendance Check-Off Table for Clipboard
          </label>
        </div>

        <div className="rounded-lg bg-neutral-900 p-3 border border-neutral-800 text-xs text-neutral-400 space-y-1">
          <div>• High-contrast, ink-friendly printable session card for courtside use.</div>
          <div>• Features timeline intervals, drill categories, intensity tags, and coaching notes.</div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrintSession}>
            Print Practice Plan / PDF
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
