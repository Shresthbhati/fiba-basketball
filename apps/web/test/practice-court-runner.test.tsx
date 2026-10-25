import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { PracticeCourtRunner } from "../lib/practice-court-runner";
import type { PracticeSession } from "../lib/practice-planner";

const MOCK_PRACTICE: PracticeSession = {
  id: "practice-123",
  teamId: "team-456",
  title: "Championship Preparation",
  scheduledAt: "2026-10-25T16:00:00Z",
  location: "Main Gymnasium Court 1",
  focus: "Defensive Rotations & Transition Spacing",
  notes: "High intensity required from tip-off.",
  totalDurationMins: 45,
  status: "SCHEDULED",
  createdBy: "coach-1",
  createdAt: "2026-10-24T12:00:00Z",
  updatedAt: "2026-10-24T12:00:00Z",
  blocks: [
    {
      id: "b1",
      order: 1,
      title: "Dynamic Activation & Closeouts",
      category: "WARMUP",
      durationMins: 10,
      notes: "Focus on low stance and vocal communication.",
    },
    {
      id: "b2",
      order: 2,
      title: "3v2 Continuous Fastbreak",
      category: "TACTICAL",
      durationMins: 15,
      notes: "Rim runner sprints hard; wings fill corners.",
      playId: "play-789",
    },
    {
      id: "b3",
      order: 3,
      title: "5v5 Situational Scrimmage",
      category: "SCRIMMAGE",
      durationMins: 20,
      notes: "Trailing by 4 with 2:00 on the clock.",
    },
  ],
  attendance: [
    { userId: "player-1", name: "Marcus Smart", status: "PRESENT" },
    { userId: "player-2", name: "Jaylen Brown", status: "PRESENT" },
    { userId: "player-3", name: "Al Horford", status: "EXCUSED" },
  ],
};

describe("PracticeCourtRunner Component (Spec §9.2, §9.3, WP-4.3)", () => {
  it("renders active drill details, category badge, timer, and controls", () => {
    render(
      <PracticeCourtRunner
        practice={MOCK_PRACTICE}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: /Practice Live Court Runner/i })).toBeDefined();
    expect(screen.getByText("Championship Preparation")).toBeDefined();
    expect(screen.getByText("Dynamic Activation & Closeouts")).toBeDefined();
    expect(screen.getByText(/WARMUP & ACTIVATION/i)).toBeDefined();
    expect(screen.getByText("Focus on low stance and vocal communication.")).toBeDefined();

    // Initial countdown for 10 min block is 10:00
    expect(screen.getByText("10:00")).toBeDefined();

    // Action buttons
    expect(screen.getByRole("button", { name: /Start Block/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Next Drill/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /\+1 Min/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Whistle Cue/i })).toBeDefined();
  });

  it("toggles play/pause timer and adds +1 minute extension", () => {
    render(
      <PracticeCourtRunner
        practice={MOCK_PRACTICE}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const startBtn = screen.getByRole("button", { name: /Start Block/i });
    fireEvent.click(startBtn);

    // Button updates to Pause Timer
    expect(screen.getByRole("button", { name: /Pause Timer/i })).toBeDefined();

    // Click +1 Min extension
    const addMinBtn = screen.getByRole("button", { name: /\+1 Min/i });
    fireEvent.click(addMinBtn);

    // 10:00 + 1m = 11:00
    expect(screen.getByText("11:00")).toBeDefined();
  });

  it("advances to next drill and previous drill updating duration clock", () => {
    render(
      <PracticeCourtRunner
        practice={MOCK_PRACTICE}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Initial block #1
    expect(screen.getByText("Dynamic Activation & Closeouts")).toBeDefined();
    expect(screen.getByText("10:00")).toBeDefined();

    // Advance to block #2
    const nextBtn = screen.getByRole("button", { name: /Next Drill/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText("3v2 Continuous Fastbreak")).toBeDefined();
    expect(screen.getByText(/TACTICAL INSTALLATION/i)).toBeDefined();
    expect(screen.getByText("15:00")).toBeDefined();

    // Click previous
    const prevBtn = screen.getByRole("button", { name: /Previous/i });
    fireEvent.click(prevBtn);

    expect(screen.getByText("Dynamic Activation & Closeouts")).toBeDefined();
    expect(screen.getByText("10:00")).toBeDefined();
  });

  it("allows toggling floor attendance and updates attendance record", () => {
    const updateAttendanceSpy = vi.fn();

    render(
      <PracticeCourtRunner
        practice={MOCK_PRACTICE}
        isOpen={true}
        onClose={vi.fn()}
        onUpdateAttendance={updateAttendanceSpy}
      />
    );

    // Open floor roster
    const rosterBtn = screen.getByRole("button", { name: /Floor Roster/i });
    fireEvent.click(rosterBtn);

    expect(screen.getByText("Marcus Smart")).toBeDefined();
    expect(screen.getByText("Jaylen Brown")).toBeDefined();

    // Toggle Marcus Smart to Absent (A)
    const absentBtns = screen.getAllByRole("button", { name: "A" });
    fireEvent.click(absentBtns[0]!);

    expect(updateAttendanceSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: "player-1", status: "ABSENT" }),
      ])
    );
  });

  it("handles final drill completion and allows finishing practice session", async () => {
    const updateStatusSpy = vi.fn().mockResolvedValue(undefined);
    const closeSpy = vi.fn();

    render(
      <PracticeCourtRunner
        practice={MOCK_PRACTICE}
        isOpen={true}
        onClose={closeSpy}
        onUpdateStatus={updateStatusSpy}
      />
    );

    // Move to block 2
    fireEvent.click(screen.getByRole("button", { name: /Next Drill/i }));
    // Move to block 3 (final block)
    fireEvent.click(screen.getByRole("button", { name: /Next Drill/i }));

    expect(screen.getByText("5v5 Situational Scrimmage")).toBeDefined();
    const finishBtn = screen.getByRole("button", { name: /Finish Practice/i });
    expect(finishBtn).toBeDefined();

    fireEvent.click(finishBtn);

    // Practice completed modal dialog appears
    expect(screen.getByText(/Practice Session Finished!/i)).toBeDefined();

    // Finalize practice
    const finalizeBtn = screen.getByRole("button", { name: /Finalize & Log Session/i });
    fireEvent.click(finalizeBtn);

    expect(updateStatusSpy).toHaveBeenCalledWith("COMPLETED");
  });
});
