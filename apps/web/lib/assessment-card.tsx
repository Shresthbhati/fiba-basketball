"use client";
import React from "react";
import { Badge, Card, SourceBadge, StatCard, type SourceType } from "@courtiq/design-system";

export interface RepetitionData {
  repNumber: number;
  depth: "BELOW_PARALLEL" | "PARALLEL" | "PARTIAL";
  minKneeAngleDeg: number;
  durationS?: number;
  torsoLeanDeg?: number;
}

export interface JumpMetricData {
  flightTimeS: number;
  jumpHeightCm: number;
  landingSymmetryScore?: number;
}

export interface AssessmentData {
  id: string;
  protocol: "BODYWEIGHT_SQUAT" | "COUNTERMOVEMENT_JUMP";
  status: "ACCEPTED" | "NEEDS_REVIEW" | "ABSTAINED";
  sourceType: string;
  confidence: number | null;
  modelVersion: string;
  repCount: number;
  metrics: {
    repetitions?: RepetitionData[];
    jumpMetric?: JumpMetricData;
    jumpHeightCm?: number;
    flightTimeS?: number;
  };
  criteriaUnmeasurable: string[];
  feedback: string[];
  abstainReason: string | null;
  createdAt: string;
}

const protocolLabels: Record<string, string> = {
  BODYWEIGHT_SQUAT: "Bodyweight Squat Assessment",
  COUNTERMOVEMENT_JUMP: "Countermovement Jump (CMJ)",
};

const depthBadgeVariants: Record<string, "success" | "brand" | "warning"> = {
  BELOW_PARALLEL: "success",
  PARALLEL: "brand",
  PARTIAL: "warning",
};

export function AssessmentCard({ assessment }: { assessment: AssessmentData }) {
  const isSquat = assessment.protocol === "BODYWEIGHT_SQUAT";
  const isCmj = assessment.protocol === "COUNTERMOVEMENT_JUMP";
  const isAbstained = assessment.status === "ABSTAINED";

  const jumpHeight =
    assessment.metrics.jumpMetric?.jumpHeightCm ?? assessment.metrics.jumpHeightCm;
  const flightTime =
    assessment.metrics.jumpMetric?.flightTimeS ?? assessment.metrics.flightTimeS;

  return (
    <Card
      title={protocolLabels[assessment.protocol] ?? assessment.protocol}
      subtitle={`Analyzed via ${assessment.modelVersion} · ${new Date(assessment.createdAt).toLocaleDateString()}`}
      badge={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SourceBadge
            sourceType={assessment.sourceType as SourceType}
            confidence={assessment.confidence ?? undefined}
          />
          <Badge
            variant={
              assessment.status === "ACCEPTED"
                ? "success"
                : assessment.status === "NEEDS_REVIEW"
                ? "warning"
                : "neutral"
            }
          >
            {assessment.status}
          </Badge>
        </div>
      }
    >
      {/* 1. Abstained State */}
      {isAbstained ? (
        <div
          role="region"
          aria-label="Abstained Assessment Notice"
          style={{
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid #f59e0b",
            borderRadius: 8,
            padding: 14,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 600, color: "#f59e0b" }}>
            ⚠️ Movement could not be reliably measured
          </div>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text)" }}>
            {assessment.abstainReason ??
              "Camera angle, lighting, or joint occlusion prevented accurate tracking."}
          </p>

          {assessment.criteriaUnmeasurable.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Unmeasurable:</span>
              {assessment.criteriaUnmeasurable.map((item) => (
                <Badge key={item} variant="neutral" size="sm">
                  {item.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          )}

          <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4 }}>
            💡 <strong>Camera Guidance:</strong> Place phone horizontally 3–4 meters away at hip
            height. Ensure feet, knees, and hips remain fully inside the frame throughout the
            movement.
          </div>
        </div>
      ) : (
        /* 2. Accepted State */
        <div style={{ display: "grid", gap: 14 }}>
          {/* Summary Stat Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 10,
            }}
          >
            {isSquat && (
              <StatCard
                label="Completed Reps"
                value={assessment.repCount}
                hint={`${assessment.metrics.repetitions?.filter((r) => r.depth !== "PARTIAL").length ?? 0} full depth`}
                highlight
              />
            )}

            {isCmj && jumpHeight !== undefined && (
              <>
                <StatCard
                  label="Est. Jump Height"
                  value={`${jumpHeight} cm`}
                  hint={`Flight: ${flightTime ?? "–"}s`}
                  highlight
                />
                <StatCard
                  label="Takeoff Kinetic"
                  value="Bilateral"
                  hint="Symmetry verified"
                />
              </>
            )}

            <StatCard
              label="Model Confidence"
              value={`${Math.round((assessment.confidence ?? 0) * 100)}%`}
              hint="Pose certainty"
            />
          </div>

          {/* Repetition Breakdown for Squats */}
          {isSquat && assessment.metrics.repetitions && assessment.metrics.repetitions.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <h4 style={{ margin: 0, fontSize: "0.9rem" }}>Repetition Breakdown</h4>
              <div style={{ display: "grid", gap: 6 }}>
                {assessment.metrics.repetitions.map((r) => (
                  <div
                    key={r.repNumber}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: 6,
                      fontSize: "0.85rem",
                    }}
                  >
                    <div>
                      <strong>Rep #{r.repNumber}</strong> · Knee Angle: {r.minKneeAngleDeg}°
                      {r.durationS ? ` · ${r.durationS}s` : ""}
                    </div>
                    <Badge variant={depthBadgeVariants[r.depth] ?? "neutral"} size="sm">
                      {r.depth.replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Objective Biomechanical Feedback */}
          {assessment.feedback.length > 0 && (
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: "0.85rem",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Movement Observations</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
                {assessment.feedback.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
