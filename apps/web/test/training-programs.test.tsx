import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  TrainingProgramsView,
  type ProgramEnrollment,
  type TrainingProgram,
} from "../lib/training-programs";

const mockPrograms: TrainingProgram[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    slug: "8-week-off-season-vertical-power",
    name: "8-Week Off-Season Vertical Jump & Force Foundation",
    phase: "OFF_SEASON",
    description: "Build max lower-body force and convert structural strength into reactive vertical jump.",
    durationWeeks: 8,
    daysPerWeek: 3,
    targetLevel: "INTERMEDIATE",
    primaryGoal: "VERTICAL_POWER",
    isTemplate: true,
    reviewed: false,
    totalWorkouts: 24,
    workouts: [
      {
        id: "w1",
        programId: "20000000-0000-4000-8000-000000000001",
        weekNumber: 1,
        dayNumber: 1,
        title: "Day 1: Maximal Force & Launch",
        focus: "LOWER_BODY_FORCE",
        estimatedDurationMin: 50,
        exercisesPrescription: [
          { exerciseSlug: "trap-bar-deadlift", exerciseName: "Trap Bar Deadlift", orderIndex: 1, targetSets: 4, targetReps: 6 },
        ],
      },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    slug: "in-season-maintenance-micro-dosing",
    name: "In-Season Maintenance & High-Intent Micro-Dosing",
    phase: "IN_SEASON",
    description: "Low-volume, high-velocity micro-dosing protocol to preserve peak neural drive.",
    durationWeeks: 4,
    daysPerWeek: 2,
    targetLevel: "ADVANCED",
    primaryGoal: "FATIGUE_MANAGEMENT",
    isTemplate: true,
    reviewed: false,
    totalWorkouts: 8,
  },
];

const mockEnrollment: ProgramEnrollment = {
  id: "enroll-1",
  programId: "20000000-0000-4000-8000-000000000001",
  programName: "8-Week Off-Season Vertical Jump & Force Foundation",
  programPhase: "OFF_SEASON",
  primaryGoal: "VERTICAL_POWER",
  durationWeeks: 8,
  daysPerWeek: 3,
  athleteId: "me",
  startDate: "2026-10-24",
  currentWeek: 1,
  status: "ACTIVE",
  completedWorkoutIds: [],
  totalWorkouts: 24,
  completedCount: 0,
  adherencePercent: 0,
  painReportedRecently: false,
  workouts: [
    {
      id: "w1",
      programId: "20000000-0000-4000-8000-000000000001",
      weekNumber: 1,
      dayNumber: 1,
      title: "Day 1: Maximal Force & Launch",
      focus: "LOWER_BODY_FORCE",
      estimatedDurationMin: 50,
      completed: false,
      exercisesPrescription: [
        { exerciseSlug: "trap-bar-deadlift", exerciseName: "Trap Bar Deadlift", orderIndex: 1, targetSets: 4, targetReps: 6, targetRpe: 8 },
      ],
    },
  ],
};

describe("TrainingProgramsView", () => {
  it("renders the periodization hub and program template cards", () => {
    render(
      <TrainingProgramsView
        initialPrograms={mockPrograms}
      />,
    );

    expect(screen.getByTestId("training-programs-hub")).toBeDefined();
    expect(screen.getByText("Periodized Training Programs & Macrocycles")).toBeDefined();

    const offSeasonCard = screen.getByTestId("program-card-8-week-off-season-vertical-power");
    expect(offSeasonCard).toBeDefined();
    expect(offSeasonCard.textContent).toContain("Off-Season");
    expect(offSeasonCard.textContent).toContain("INTERMEDIATE");
    expect(offSeasonCard.textContent).toContain("Awaiting S&C Review");
    expect(offSeasonCard.textContent).toContain("8 Weeks");
    expect(offSeasonCard.textContent).toContain("3 Days/Wk");
  });

  it("filters programs by phase buttons", () => {
    render(
      <TrainingProgramsView
        initialPrograms={mockPrograms}
      />,
    );

    expect(screen.getByTestId("program-card-8-week-off-season-vertical-power")).toBeDefined();
    expect(screen.getByTestId("program-card-in-season-maintenance-micro-dosing")).toBeDefined();

    // Click In-Season filter
    fireEvent.click(screen.getByRole("button", { name: "In-Season" }));
    expect(screen.queryByTestId("program-card-8-week-off-season-vertical-power")).toBeNull();
    expect(screen.getByTestId("program-card-in-season-maintenance-micro-dosing")).toBeDefined();

    // Click All Phases
    fireEvent.click(screen.getByRole("button", { name: "All Phases" }));
    expect(screen.getByTestId("program-card-8-week-off-season-vertical-power")).toBeDefined();
  });

  it("renders active enrollment with adherence and scheduled workouts", () => {
    render(
      <TrainingProgramsView
        initialPrograms={mockPrograms}
        activeEnrollment={mockEnrollment}
      />,
    );

    expect(screen.getByTestId("active-enrollment-card")).toBeDefined();
    expect(screen.getByText("Week 1 of 8 • Started 2026-10-24")).toBeDefined();

    const workoutCard = screen.getByTestId("workout-card-w1");
    expect(workoutCard).toBeDefined();
    expect(workoutCard.textContent).toContain("Day 1: Maximal Force & Launch");
    expect(workoutCard.textContent).toContain("Trap Bar Deadlift");
    expect(workoutCard.textContent).toContain("4×6");
  });

  it("displays pain safety stop alert when painReportedRecently is true (ADR-0009)", () => {
    const painEnrollment = {
      ...mockEnrollment,
      painReportedRecently: true,
    };

    render(
      <TrainingProgramsView
        initialPrograms={mockPrograms}
        activeEnrollment={painEnrollment}
      />,
    );

    expect(screen.getByTestId("pain-safety-stop-alert")).toBeDefined();
    expect(screen.getByText(/You reported pain in a recent wellness check/i)).toBeDefined();
  });

  it("opens program blueprint modal when clicking View Blueprint", () => {
    render(
      <TrainingProgramsView
        initialPrograms={mockPrograms}
      />,
    );

    const blueprintButtons = screen.getAllByRole("button", { name: "View Blueprint" });
    fireEvent.click(blueprintButtons[0]!);

    expect(screen.getByTestId("blueprint-modal")).toBeDefined();
    expect(screen.getByText("Scheduled Workouts & Exercise Prescriptions")).toBeDefined();
  });

  it("handles program enrollment", async () => {
    const handleEnroll = vi.fn().mockResolvedValue(undefined);

    render(
      <TrainingProgramsView
        initialPrograms={mockPrograms}
        onEnroll={handleEnroll}
      />,
    );

    const enrollBtn = screen.getByTestId("enroll-button-8-week-off-season-vertical-power");
    fireEvent.click(enrollBtn);

    expect(handleEnroll).toHaveBeenCalledWith("20000000-0000-4000-8000-000000000001");
  });

  it("handles completing a workout within an active enrollment", async () => {
    const handleComplete = vi.fn().mockResolvedValue(undefined);

    render(
      <TrainingProgramsView
        initialPrograms={mockPrograms}
        activeEnrollment={mockEnrollment}
        onCompleteWorkout={handleComplete}
      />,
    );

    const completeBtn = screen.getByTestId("complete-workout-btn-w1");
    fireEvent.click(completeBtn);

    expect(handleComplete).toHaveBeenCalledWith("enroll-1", "w1");
  });
});
