import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PracticePlanner,
  type PracticeSession,
  type DrillItem,
} from "../lib/practice-planner";

const samplePractice: PracticeSession = {
  id: "prac-001",
  teamId: "team-101",
  title: "Defensive Intensity & Shell Principles",
  scheduledAt: "2026-10-25T17:00:00Z",
  location: "Courtside Arena 2",
  focus: "Shell drill rotations and transition sprint back",
  notes: "Reversible practice pinnies required",
  totalDurationMins: 60,
  status: "SCHEDULED",
  createdBy: "coach-vance",
  createdAt: "2026-10-23T10:00:00Z",
  updatedAt: "2026-10-23T10:00:00Z",
  blocks: [
    {
      id: "b1",
      order: 1,
      title: "Dynamic Activation",
      category: "WARMUP",
      durationMins: 15,
      notes: "High knee skips, lateral defensive slides",
    },
    {
      id: "b2",
      order: 2,
      title: "Shell Drill 4-on-4",
      category: "TACTICAL",
      durationMins: 25,
      notes: "Weakside help and recover",
      playId: "play-shell-01",
    },
    {
      id: "b3",
      order: 3,
      title: "Full-Court 5-on-5",
      category: "SCRIMMAGE",
      durationMins: 20,
    },
  ],
  attendance: [
    { userId: "u-player1", name: "David Brooks", status: "PRESENT" },
    { userId: "u-player2", name: "Alex Chen", status: "INJURED", note: "Shoulder rehab" },
    { userId: "u-player3", name: "Marcus Stone", status: "ABSENT" },
  ],
};

const sampleDrills: DrillItem[] = [
  {
    id: "drill-01",
    title: "Closeout 1-on-1 Drill",
    category: "TECHNICAL",
    intensity: "HIGH",
    suggestedDurationMins: 10,
    brief: "Contest with high hand and slide without fouling.",
    tags: ["defense", "closeout"],
  },
  {
    id: "drill-02",
    title: "Free Throw Pressure 1-and-1",
    category: "COOLDOWN",
    intensity: "LOW",
    suggestedDurationMins: 5,
    brief: "Mental toughness free throws under fatigue.",
    tags: ["cooldown", "free-throws"],
  },
];

describe("PracticePlanner (WP-4.3)", () => {
  it("renders session header, total duration, and initial scheduled blocks", () => {
    render(<PracticePlanner practice={samplePractice} drillsCatalog={sampleDrills} />);

    expect(screen.getByText("Defensive Intensity & Shell Principles")).toBeDefined();
    expect(screen.getByText(/Courtside Arena 2/)).toBeDefined();
    expect(screen.getByText("60")).toBeDefined(); // total duration

    // Blocks
    expect(screen.getByText("Dynamic Activation")).toBeDefined();
    expect(screen.getByText("Shell Drill 4-on-4")).toBeDefined();
    expect(screen.getByText("Full-Court 5-on-5")).toBeDefined();

    // Playbook link
    expect(screen.getByText("🏀 Open Tactical Play")).toBeDefined();
  });

  it("switches to Attendance tab and displays player roster with quick toggles", async () => {
    const onAttendanceUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <PracticePlanner
        practice={samplePractice}
        drillsCatalog={sampleDrills}
        onAttendanceUpdate={onAttendanceUpdate}
      />
    );

    // Switch tab
    const attendanceTab = screen.getByText(/Attendance \(3\)/);
    fireEvent.click(attendanceTab);

    expect(screen.getByText("David Brooks")).toBeDefined();
    expect(screen.getByText("Alex Chen")).toBeDefined();
    expect(screen.getByText("Injured (Rehab)")).toBeDefined();

    // Toggle Alex Chen to PRESENT (button with 'P')
    const pButtons = screen.getAllByRole("button", { name: "P" });
    fireEvent.click(pButtons[1]!); // Second row (Alex Chen)

    expect(onAttendanceUpdate).toHaveBeenCalledTimes(1);
  });

  it("switches to Drill Catalog tab and shows available standard drills", () => {
    render(<PracticePlanner practice={samplePractice} drillsCatalog={sampleDrills} />);

    // Switch tab
    const drillsTab = screen.getByText(/Drill Catalog \(2\)/);
    fireEvent.click(drillsTab);

    expect(screen.getByText("Closeout 1-on-1 Drill")).toBeDefined();
    expect(screen.getByText("Free Throw Pressure 1-and-1")).toBeDefined();
    expect(screen.getByText(/#closeout/)).toBeDefined();
  });

  it("removes a block and recalculates total duration in real-time", () => {
    render(<PracticePlanner practice={samplePractice} drillsCatalog={sampleDrills} />);

    expect(screen.getByText("60")).toBeDefined();

    // Remove first block (15 mins)
    const removeBtn = screen.getByLabelText("Remove block Dynamic Activation");
    fireEvent.click(removeBtn);

    // Total duration should now be 25 + 20 = 45 mins
    expect(screen.getByText("45")).toBeDefined();
  });

  it("opens modal and appends a drill from catalog into the practice timeline", () => {
    render(<PracticePlanner practice={samplePractice} drillsCatalog={sampleDrills} />);

    const addBtn = screen.getByRole("button", { name: "+ Add Drill / Block" });
    fireEvent.click(addBtn);

    expect(screen.getByText("Pick Drill to Append")).toBeDefined();

    // Select the closeout drill
    const selectButtons = screen.getAllByRole("button", { name: "Select" });
    fireEvent.click(selectButtons[0]!); // Closeout drill (10m)

    // Total duration should now be 60 + 10 = 70 mins
    expect(screen.getByText("70")).toBeDefined();
    expect(screen.getByText("Closeout 1-on-1 Drill")).toBeDefined();
  });
});
