import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssessmentReview, type DetailedAssessment, type ShareGrantItem } from "../lib/assessment-review";

const mockAssessment: DetailedAssessment = {
  id: "as-01",
  userId: "athlete-1",
  protocol: "BODYWEIGHT_SQUAT",
  status: "NEEDS_REVIEW",
  sourceType: "CV_ESTIMATE",
  confidence: 0.94,
  modelVersion: "court-iq-pose-v1.0",
  protocolVersion: "protocol-v1.0",
  repCount: 3,
  metrics: {
    repetitions: [
      { repNumber: 1, depth: "BELOW_PARALLEL", minKneeAngleDeg: 81.2 },
      { repNumber: 2, depth: "BELOW_PARALLEL", minKneeAngleDeg: 83.0 },
      { repNumber: 3, depth: "PARALLEL", minKneeAngleDeg: 88.5 },
    ],
  },
  criteriaUnmeasurable: [],
  feedback: ["Full depth reached across all 3 repetitions."],
  coachFeedback: [
    {
      id: "fb-1",
      authorId: "coach-1",
      authorRole: "COACH",
      notes: "Solid eccentric control. Focus on knee tracking.",
      cues: ["Drive through midfoot", "Knees out"],
      createdAt: "2026-10-23T10:00:00Z",
    },
  ],
  createdAt: "2026-10-23T09:00:00Z",
};

const mockGrants: ShareGrantItem[] = [
  {
    id: "grant-1",
    assessmentId: "as-01",
    athleteId: "athlete-1",
    granteeId: "coach-1",
    granteeName: "Coach Carter",
    role: "COACH",
    createdAt: "2026-10-23T09:30:00Z",
  },
];

describe("AssessmentReview (WP-2.7 & WP-2.8)", () => {
  it("renders header, CV_ESTIMATE provenance badge, and repetition breakdown", () => {
    render(<AssessmentReview assessment={mockAssessment} shareGrants={mockGrants} />);

    expect(screen.getByText("Bodyweight Squat Assessment")).toBeDefined();
    expect(screen.getByText("court-iq-pose-v1.0")).toBeDefined();
    expect(screen.getByText("Repetition #1")).toBeDefined();
    expect(screen.getByText("Repetition #2")).toBeDefined();
    expect(screen.getByText("Repetition #3")).toBeDefined();
    expect(screen.getAllByText("BELOW PARALLEL").length).toBe(2);
  });

  it("switches to Coach Feedback tab and displays cues", () => {
    render(<AssessmentReview assessment={mockAssessment} shareGrants={mockGrants} />);

    const coachTab = screen.getByRole("button", { name: "Coach Feedback (1)" });
    fireEvent.click(coachTab);

    expect(screen.getByText("Solid eccentric control. Focus on knee tracking.")).toBeDefined();
    expect(screen.getByText(/Drive through midfoot/)).toBeDefined();
    expect(screen.getByText(/Knees out/)).toBeDefined();
  });

  it("submits new coach feedback form", () => {
    const onAddFeedback = vi.fn().mockResolvedValue(undefined);
    render(<AssessmentReview assessment={mockAssessment} shareGrants={mockGrants} onAddFeedback={onAddFeedback} />);

    const coachTab = screen.getByRole("button", { name: "Coach Feedback (1)" });
    fireEvent.click(coachTab);

    const textarea = screen.getByPlaceholderText(/Enter technique observations/);
    fireEvent.change(textarea, { target: { value: "Great torso angle." } });

    const cuesInput = screen.getByPlaceholderText(/Technical cues/);
    fireEvent.change(cuesInput, { target: { value: "Chest up, Breathe" } });

    const submitBtn = screen.getByRole("button", { name: "Submit Feedback" });
    fireEvent.click(submitBtn);

    expect(onAddFeedback).toHaveBeenCalledWith("Great torso angle.", ["Chest up", "Breathe"]);
  });

  it("switches to Sharing Grants tab and triggers immediate revocation", () => {
    const onRevokeGrant = vi.fn().mockResolvedValue(undefined);
    render(<AssessmentReview assessment={mockAssessment} shareGrants={mockGrants} onRevokeGrant={onRevokeGrant} />);

    const sharingTab = screen.getByRole("button", { name: "Coach Sharing (1)" });
    fireEvent.click(sharingTab);

    expect(screen.getByText("Coach Carter")).toBeDefined();

    const revokeBtn = screen.getByRole("button", { name: "Revoke Access" });
    fireEvent.click(revokeBtn);

    expect(onRevokeGrant).toHaveBeenCalledWith("grant-1");
  });

  it("triggers status change toggle from athlete owner", () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    render(<AssessmentReview assessment={mockAssessment} shareGrants={mockGrants} onStatusChange={onStatusChange} />);

    const acceptBtn = screen.getByRole("button", { name: "✓ Accept Assessment" });
    fireEvent.click(acceptBtn);

    expect(onStatusChange).toHaveBeenCalledWith("ACCEPTED");
  });
});
