import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoachAssignments, type AssignmentItem } from "../lib/coach-assignments";

const mockAssignments: AssignmentItem[] = [
  {
    id: "assign-1",
    teamId: "team-1",
    coachId: "coach-1",
    title: "Pick & Roll Drop Coverage Film Review",
    description: "Analyze the drop vs switch coverage against high horns action.",
    type: "FILM_STUDY",
    priority: "HIGH",
    dueAt: "2026-10-25T12:00:00Z",
    resourceRef: {
      type: "SCOUTING_MONTAGE",
      id: "montage-1",
      title: "Horns PNR Reel",
    },
    quizQuestions: [
      {
        id: "q1",
        question: "When the ball screen is set at the 45-degree angle, where does the low-man helper position their feet?",
        options: [
          "At the 3-point line",
          "One foot in the paint with chest to baseline",
          "Behind the offensive center",
        ],
      },
    ],
    targetAthleteIds: [],
    status: "ACTIVE",
    createdAt: "2026-10-23T08:00:00Z",
    submission: null,
  },
  {
    id: "assign-2",
    teamId: "team-1",
    coachId: "coach-1",
    title: "Spain Action 5-on-0 Walkthrough",
    description: "Review Spain action tactical set.",
    type: "DRILL_PRACTICE",
    priority: "NORMAL",
    dueAt: "2026-10-26T12:00:00Z",
    resourceRef: {
      type: "TACTICAL_PLAY",
      id: "play-1",
      title: "Spain PNR Play",
    },
    targetAthleteIds: [],
    status: "ACTIVE",
    createdAt: "2026-10-23T08:00:00Z",
    submission: {
      id: "sub-1",
      status: "REVIEWED",
      score: 95,
      coachNotes: "Great focus on backscreen timing.",
      submittedAt: "2026-10-23T10:00:00Z",
      reviewedAt: "2026-10-23T11:00:00Z",
    },
  },
];

describe("CoachAssignments component (WP-4.4)", () => {
  it("renders assignment cards, KPI stats, and priority badges", () => {
    render(<CoachAssignments assignments={mockAssignments} />);

    expect(screen.getByText("My Training Assignments")).toBeDefined();
    expect(screen.getByText("Pick & Roll Drop Coverage Film Review")).toBeDefined();
    expect(screen.getByText("Spain Action 5-on-0 Walkthrough")).toBeDefined();
    expect(screen.getByText("HIGH")).toBeDefined();
    expect(screen.getByText("NORMAL")).toBeDefined();
    expect(screen.getByText("Open in Film Room →")).toBeDefined();
    expect(screen.getByText("Open in Tactical Lab →")).toBeDefined();
  });

  it("filters assignments by type when clicking category filter buttons", () => {
    render(<CoachAssignments assignments={mockAssignments} />);

    // Click Practice Drill filter
    const drillBtn = screen.getByRole("button", { name: "Practice Drill" });
    fireEvent.click(drillBtn);

    // Only Spain Action should be displayed
    expect(screen.getByText("Spain Action 5-on-0 Walkthrough")).toBeDefined();
    expect(screen.queryByText("Pick & Roll Drop Coverage Film Review")).toBeNull();
  });

  it("allows athlete to open quiz, select answers, and submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CoachAssignments assignments={mockAssignments} onSubmitAssignment={onSubmit} />);

    // Click Take Quiz
    const quizBtn = screen.getByRole("button", { name: /Take Quiz & Complete/i });
    fireEvent.click(quizBtn);

    expect(screen.getByText("Check for Understanding")).toBeDefined();

    // Select option
    const radio = screen.getByLabelText("One foot in the paint with chest to baseline");
    fireEvent.click(radio);

    // Type notes
    const textarea = screen.getByPlaceholderText(/Add any notes/i);
    fireEvent.change(textarea, { target: { value: "Understood the rotation rule." } });

    // Submit
    const submitBtn = screen.getByRole("button", { name: "Submit Task" });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith("assign-1", {
      selectedOptions: {
        q1: 1,
      },
      athleteNotes: "Understood the rotation rule.",
    });
  });

  it("displays coach feedback and score when assignment is reviewed", () => {
    render(<CoachAssignments assignments={mockAssignments} />);

    expect(screen.getByText("Score: 95%")).toBeDefined();
    expect(screen.getByText("✓ Reviewed by Coach")).toBeDefined();
    expect(screen.getByText(/"Great focus on backscreen timing."/)).toBeDefined();
  });

  it("supports coach mode with create assignment modal", () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CoachAssignments assignments={mockAssignments} isCoach={true} onCreateAssignment={onCreate} />);

    expect(screen.getByText("Coach Assignment Hub")).toBeDefined();
    const createBtn = screen.getByRole("button", { name: "+ Create Assignment" });
    fireEvent.click(createBtn);

    expect(screen.getByText("Create Coach Assignment")).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Pick & Roll/i), {
      target: { value: "Defensive Transition Sprint Test" },
    });

    const submitBtn = screen.getByRole("button", { name: "Create Assignment" });
    fireEvent.click(submitBtn);

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Defensive Transition Sprint Test",
        type: "FILM_STUDY",
      })
    );
  });
});
