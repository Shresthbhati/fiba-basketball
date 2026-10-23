import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoachDashboard, type CoachDashboardData } from "../lib/coach-dashboard";

const mockDashboardData: CoachDashboardData = {
  teamId: "team-1",
  activeAssignmentCount: 3,
  openReviewCount: 1,
  overdueCount: 0,
  squadAdherenceRate: 85,
  reviewQueue: [
    {
      id: "sub-1",
      assignmentId: "assign-1",
      assignmentTitle: "Pick & Roll Drop Coverage Film Review",
      assignmentType: "FILM_STUDY",
      priority: "HIGH",
      athleteId: "athlete-1",
      athleteName: "Marcus Vance",
      athleteEmail: "marcus@example.com",
      score: 100,
      submittedAt: "2026-10-23T10:00:00Z",
      answers: {
        athleteNotes: "Watched clips. Need to stunt harder from the nail.",
      },
    },
  ],
  recentActivity: [
    {
      id: "act-1",
      type: "SUBMISSION_RECEIVED",
      assignmentTitle: "Pick & Roll Drop Coverage Film Review",
      athleteName: "Marcus Vance",
      status: "SUBMITTED",
      score: 100,
      timestamp: "2026-10-23T10:00:00Z",
    },
  ],
};

describe("CoachDashboard component (WP-4.5)", () => {
  it("renders KPIs and squad adherence metrics", () => {
    render(<CoachDashboard data={mockDashboardData} />);

    expect(screen.getByText("Coach Command Center")).toBeDefined();
    expect(screen.getByText("Squad Adherence")).toBeDefined();
    expect(screen.getByText("85% compliance")).toBeDefined();
    expect(screen.getByText("Pending Athlete Submissions (1)")).toBeDefined();
  });

  it("renders review queue cards with athlete name and score", () => {
    render(<CoachDashboard data={mockDashboardData} />);

    expect(screen.getAllByText("Marcus Vance").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.getByText("HIGH")).toBeDefined();
    expect(screen.getByRole("button", { name: "Evaluate Submission" })).toBeDefined();
  });

  it("opens review dialog and allows approving submission with feedback cues", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    render(<CoachDashboard data={mockDashboardData} onReviewSubmission={onReview} />);

    fireEvent.click(screen.getByRole("button", { name: "Evaluate Submission" }));

    expect(screen.getByText("Submission Evaluation")).toBeDefined();
    expect(screen.getByText(/Watched clips\. Need to stunt harder/)).toBeDefined();

    // Fill feedback
    const notesInput = screen.getByPlaceholderText(/Provide constructive feedback/i);
    fireEvent.change(notesInput, {
      target: { value: "Spot-on observation. We will drill nail stunts on Thursday." },
    });

    // Approve
    const approveBtn = screen.getByRole("button", { name: "Approve & Mark Reviewed" });
    fireEvent.click(approveBtn);

    expect(onReview).toHaveBeenCalledWith("sub-1", {
      status: "REVIEWED",
      coachNotes: "Spot-on observation. We will drill nail stunts on Thursday.",
      score: 100,
    });
  });

  it("allows requesting revision with specific coach cues", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    render(<CoachDashboard data={mockDashboardData} onReviewSubmission={onReview} />);

    fireEvent.click(screen.getByRole("button", { name: "Evaluate Submission" }));

    const notesInput = screen.getByPlaceholderText(/Provide constructive feedback/i);
    fireEvent.change(notesInput, {
      target: { value: "Re-watch clip 3; check the weakside tag." },
    });

    const revisionBtn = screen.getByRole("button", { name: "Request Revision" });
    fireEvent.click(revisionBtn);

    expect(onReview).toHaveBeenCalledWith("sub-1", {
      status: "REVISION_REQUESTED",
      coachNotes: "Re-watch clip 3; check the weakside tag.",
      score: 100,
    });
  });

  it("renders empty state when queue is clear", () => {
    const emptyData: CoachDashboardData = {
      ...mockDashboardData,
      openReviewCount: 0,
      reviewQueue: [],
    };
    render(<CoachDashboard data={emptyData} />);

    expect(screen.getByText("Review queue is clear!")).toBeDefined();
  });
});
