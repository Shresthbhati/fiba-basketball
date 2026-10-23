import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssessmentCard, type AssessmentData } from "../lib/assessment-card";

describe("AssessmentCard", () => {
  it("renders accepted squat assessment with repetition breakdown and CV_ESTIMATE badge", () => {
    const squatData: AssessmentData = {
      id: "a1",
      protocol: "BODYWEIGHT_SQUAT",
      status: "ACCEPTED",
      sourceType: "CV_ESTIMATE",
      confidence: 0.94,
      modelVersion: "court-iq-pose-v1.0",
      repCount: 3,
      metrics: {
        repetitions: [
          { repNumber: 1, depth: "BELOW_PARALLEL", minKneeAngleDeg: 81.5, durationS: 1.8 },
          { repNumber: 2, depth: "PARALLEL", minKneeAngleDeg: 89.0, durationS: 1.9 },
          { repNumber: 3, depth: "BELOW_PARALLEL", minKneeAngleDeg: 80.2, durationS: 1.7 },
        ],
      },
      criteriaUnmeasurable: [],
      feedback: ["Full depth reached on all repetitions."],
      abstainReason: null,
      createdAt: "2027-01-15T10:00:00.000Z",
    };

    render(<AssessmentCard assessment={squatData} />);

    expect(screen.getByText("Bodyweight Squat Assessment")).toBeTruthy();
    expect(screen.getByText(/CV Track/)).toBeTruthy();
    expect(screen.getAllByText(/94%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Completed Reps")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Rep #1")).toBeTruthy();
    expect(screen.getAllByText("BELOW PARALLEL").length).toBe(2);
    expect(screen.getByText("Full depth reached on all repetitions.")).toBeTruthy();
  });

  it("renders accepted CMJ assessment with vertical jump height estimate and flight time", () => {
    const cmjData: AssessmentData = {
      id: "a2",
      protocol: "COUNTERMOVEMENT_JUMP",
      status: "ACCEPTED",
      sourceType: "CV_ESTIMATE",
      confidence: 0.92,
      modelVersion: "court-iq-pose-v1.0",
      repCount: 1,
      metrics: {
        jumpMetric: {
          flightTimeS: 0.52,
          jumpHeightCm: 33.2,
          landingSymmetryScore: 0.95,
        },
      },
      criteriaUnmeasurable: [],
      feedback: ["Estimated vertical jump: 33.2 cm (flight time: 0.52s)."],
      abstainReason: null,
      createdAt: "2027-01-15T11:00:00.000Z",
    };

    render(<AssessmentCard assessment={cmjData} />);

    expect(screen.getByText("Countermovement Jump (CMJ)")).toBeTruthy();
    expect(screen.getByText("Est. Jump Height")).toBeTruthy();
    expect(screen.getByText("33.2 cm")).toBeTruthy();
    expect(screen.getByText(/Flight: 0.52s/)).toBeTruthy();
    expect(screen.getByText(/Estimated vertical jump: 33.2 cm/)).toBeTruthy();
  });

  it("renders abstained assessment notice without speculative metrics", () => {
    const abstainedData: AssessmentData = {
      id: "a3",
      protocol: "BODYWEIGHT_SQUAT",
      status: "ABSTAINED",
      sourceType: "CV_ESTIMATE",
      confidence: 0.35,
      modelVersion: "court-iq-pose-v1.0",
      repCount: 0,
      metrics: {},
      criteriaUnmeasurable: ["landmark_25_occluded", "landmark_27_occluded"],
      abstainReason: "Knees and ankles obscured by equipment bag.",
      feedback: [],
      createdAt: "2027-01-15T12:00:00.000Z",
    };

    render(<AssessmentCard assessment={abstainedData} />);

    expect(screen.getByRole("region", { name: "Abstained Assessment Notice" })).toBeTruthy();
    expect(screen.getByText(/Movement could not be reliably measured/)).toBeTruthy();
    expect(screen.getByText(/Knees and ankles obscured by equipment bag/)).toBeTruthy();
    expect(screen.getByText("landmark 25 occluded")).toBeTruthy();
    expect(screen.getByText(/Camera Guidance:/)).toBeTruthy();
    // Confirms no rep count metric was fabricated
    expect(screen.queryByText("Completed Reps")).toBeNull();
  });
});
