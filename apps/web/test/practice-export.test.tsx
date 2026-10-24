import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PracticeExportModal } from "../lib/practice-export-modal";
import { PracticePlanner, type PracticeSession } from "../lib/practice-planner";

const SAMPLE_SESSION: PracticeSession = {
  id: "prac-101",
  teamId: "team-1",
  title: "Tournament Eve Strategy Walkthrough",
  scheduledAt: "2026-10-25T18:00:00Z",
  location: "Barclays Training Gym",
  focus: "Full-court transition offense & late game inbound sets",
  notes: "Film session afterwards.",
  totalDurationMins: 75,
  attendance: [
    { userId: "u1", name: "Jaylen Brown", status: "PRESENT" },
    { userId: "u2", name: "Jayson Tatum", status: "PRESENT" },
  ],
  blocks: [
    {
      id: "b1",
      order: 1,
      title: "Warmup & Layup Lines",
      category: "WARMUP",
      durationMins: 15,
      notes: "Dynamic stretching.",
    },
    {
      id: "b2",
      order: 2,
      title: "Horns Tactical Installation",
      category: "TACTICAL",
      durationMins: 30,
      notes: "5v0 walkthrough.",
    },
    {
      id: "b3",
      order: 3,
      title: "Controlled Scrimmage",
      category: "SCRIMMAGE",
      durationMins: 30,
      notes: "Late clock scenarios.",
    },
  ],
  status: "SCHEDULED",
  createdBy: "coach-1",
  createdAt: "2026-10-24T00:00:00Z",
  updatedAt: "2026-10-24T00:00:00Z",
};

describe("Practice Plan Print Export Modal & Integration (Spec §10.4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders export modal with practice details and attendance toggle", () => {
    const onClose = vi.fn();
    render(
      <PracticeExportModal
        open={true}
        onClose={onClose}
        practice={SAMPLE_SESSION}
      />,
    );

    expect(screen.getByText(/Export Practice Plan \(Spec §10\.4\)/i)).toBeDefined();
    expect(screen.getByText(/Tournament Eve Strategy Walkthrough/i)).toBeDefined();
    expect(screen.getByText(/3 drill blocks/i)).toBeDefined();
    expect(screen.getByLabelText(/Include Roster Attendance Check-Off Table/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Print Practice Plan \/ PDF/i })).toBeDefined();
  });

  it("opens print window when clicking Print Practice Plan / PDF", () => {
    const openMock = vi.fn().mockReturnValue({
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
    });
    vi.stubGlobal("open", openMock);

    render(
      <PracticeExportModal
        open={true}
        onClose={vi.fn()}
        practice={SAMPLE_SESSION}
      />,
    );

    const printBtn = screen.getByRole("button", { name: /Print Practice Plan \/ PDF/i });
    fireEvent.click(printBtn);

    expect(openMock).toHaveBeenCalledWith("", "_blank");
  });

  it("opens export modal from PracticePlanner action bar", () => {
    render(<PracticePlanner practice={SAMPLE_SESSION} />);

    const exportBtn = screen.getByRole("button", { name: /Print \/ Export PDF/i });
    expect(exportBtn).toBeDefined();

    fireEvent.click(exportBtn);
    expect(screen.getByText(/Export Practice Plan \(Spec §10\.4\)/i)).toBeDefined();
  });
});
