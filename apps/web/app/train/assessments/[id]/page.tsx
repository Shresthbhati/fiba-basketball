"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AssessmentReview,
  type DetailedAssessment,
  type ShareGrantItem,
} from "../../../../lib/assessment-review";
import { api, ApiError } from "../../../../lib/api";

const SAMPLE_FALLBACK: DetailedAssessment = {
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
  createdAt: new Date().toISOString(),
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
};

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const assessmentQuery = useQuery({
    queryKey: ["assessment", id],
    queryFn: () => api<DetailedAssessment>(`/assessments/${id}`),
    retry: false,
  });

  const grantsQuery = useQuery({
    queryKey: ["assessmentGrants", id],
    queryFn: () => api<{ items: ShareGrantItem[] }>(`/assessments/${id}/grants`).catch(() => ({ items: [] })),
    retry: false,
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ notes, cues }: { notes: string; cues: string[] }) => {
      await api(`/assessments/${id}/feedback`, {
        method: "POST",
        body: JSON.stringify({ notes, cues }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessment", id] });
    },
  });

  const createGrantMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      await api(`/assessments/${id}/grants`, {
        method: "POST",
        body: JSON.stringify({ granteeEmail: email, role }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessmentGrants", id] });
    },
  });

  const revokeGrantMutation = useMutation({
    mutationFn: async (grantId: string) => {
      await api(`/assessments/${id}/grants/${grantId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessmentGrants", id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "ACCEPTED" | "NEEDS_REVIEW") => {
      await api(`/assessments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessment", id] });
    },
  });

  if (assessmentQuery.isError) {
    const err = assessmentQuery.error;
    if (err instanceof ApiError && err.status === 404) {
      return (
        <main style={{ maxWidth: 800, margin: "60px auto", textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Assessment Not Found</h1>
          <p style={{ color: "var(--cq-text-muted, #6b7280)" }}>
            This movement assessment does not exist or access has not been granted by the athlete.
          </p>
          <Link href="/train/assessments" style={{ color: "#1e3a8a", textDecoration: "underline" }}>
            ← Back to Assessments
          </Link>
        </main>
      );
    }
  }

  const assessment = assessmentQuery.data ?? SAMPLE_FALLBACK;
  const grants = grantsQuery.data?.items ?? [];

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/train/assessments" style={{ fontSize: 13, color: "#1e3a8a", textDecoration: "none", fontWeight: 600 }}>
          ← Back to Assessments
        </Link>
      </div>

      <AssessmentReview
        assessment={assessment}
        shareGrants={grants}
        isOwner={true}
        onAddFeedback={async (notes, cues) => {
          await feedbackMutation.mutateAsync({ notes, cues });
        }}
        onCreateGrant={async (email, role) => {
          await createGrantMutation.mutateAsync({ email, role });
        }}
        onRevokeGrant={async (grantId) => {
          await revokeGrantMutation.mutateAsync(grantId);
        }}
        onStatusChange={async (st) => {
          await statusMutation.mutateAsync(st);
        }}
      />
    </main>
  );
}
