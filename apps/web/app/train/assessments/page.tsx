"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { SourceBadge } from "@courtiq/design-system";
import { api } from "../../../lib/api";
import type { DetailedAssessment } from "../../../lib/assessment-review";

const SAMPLE_ASSESSMENTS: DetailedAssessment[] = [
  {
    id: "sample-squat-01",
    userId: "user-athlete-1",
    protocol: "BODYWEIGHT_SQUAT",
    status: "ACCEPTED",
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
    feedback: ["Full depth reached across all 3 repetitions.", "Symmetrical hip and knee descent observed."],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    coachFeedback: [
      {
        id: "fb-1",
        authorId: "coach-1",
        authorRole: "COACH",
        notes: "Great depth and controlled eccentric tempo. Keep working on ankle dorsiflexion mobility.",
        cues: ["Drive through midfoot", "Keep chest upright"],
        createdAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: "sample-cmj-01",
    userId: "user-athlete-1",
    protocol: "COUNTERMOVEMENT_JUMP",
    status: "ACCEPTED",
    sourceType: "CV_ESTIMATE",
    confidence: 0.91,
    modelVersion: "court-iq-pose-v1.0",
    protocolVersion: "protocol-v1.0",
    repCount: 1,
    metrics: {
      jumpHeightCm: 51.4,
      flightTimeS: 0.648,
    },
    criteriaUnmeasurable: [],
    feedback: ["Clean vertical takeoff with explosive countermovement dip."],
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

export default function AssessmentsPage() {
  const assessmentsQuery = useQuery({
    queryKey: ["assessments"],
    queryFn: () => api<{ items: DetailedAssessment[] }>("/assessments").catch(() => ({ items: [] })),
  });

  const assessments = assessmentsQuery.data?.items?.length
    ? assessmentsQuery.data.items
    : SAMPLE_ASSESSMENTS;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 6px 0", fontSize: 28, fontWeight: 800 }}>Player Lab — Biomechanical Movement Assessments</h1>
          <p style={{ margin: 0, color: "var(--cq-text-muted, #6b7280)", fontSize: 15 }}>
            Automated computer-vision pose analysis for basketball movement competency, squat depth, and vertical jump mechanics.
          </p>
        </div>

        <Link
          href="/train"
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            color: "#1e3a8a",
          }}
        >
          ← Training OS
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {assessments.map((item) => (
          <Link
            key={item.id}
            href={`/train/assessments/${item.id}`}
            style={{
              display: "block",
              textDecoration: "none",
              color: "inherit",
              padding: 20,
              borderRadius: 10,
              border: "1px solid var(--cq-border, #e5e7eb)",
              background: "var(--cq-card-bg, #ffffff)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              transition: "transform 0.1s ease, box-shadow 0.1s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: item.status === "ACCEPTED" ? "#dcfce7" : "#e0f2fe",
                      color: item.status === "ACCEPTED" ? "#166534" : "#0369a1",
                    }}
                  >
                    {item.status}
                  </span>
                  <SourceBadge sourceType="CV_ESTIMATE" confidence={item.confidence ?? undefined} />
                </div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: 18, fontWeight: 700 }}>
                  {item.protocol === "BODYWEIGHT_SQUAT" ? "Bodyweight Squat Assessment" : "Countermovement Jump (CMJ)"}
                </h3>
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}
                </span>
              </div>

              <div style={{ textAlign: "right" }}>
                {item.protocol === "BODYWEIGHT_SQUAT" && (
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a8a" }}>
                    {item.repCount} reps analyzed
                  </div>
                )}
                {item.protocol === "COUNTERMOVEMENT_JUMP" && (
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a8a" }}>
                    {item.metrics.jumpHeightCm ?? item.metrics.jumpMetric?.jumpHeightCm} cm
                  </div>
                )}
                <span style={{ fontSize: 12, color: "#0284c7", fontWeight: 600 }}>
                  Open Interactive Skeleton Review →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
