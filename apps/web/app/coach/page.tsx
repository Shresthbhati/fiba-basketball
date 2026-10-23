"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CoachDashboard, type CoachDashboardData, type SubmissionStatus } from "../../lib/coach-dashboard";
import { api } from "../../lib/api";

const SAMPLE_DASHBOARD_DATA: CoachDashboardData = {
  teamId: "team-demo-01",
  activeAssignmentCount: 4,
  openReviewCount: 2,
  overdueCount: 1,
  squadAdherenceRate: 88,
  reviewQueue: [
    {
      id: "sub-pending-01",
      assignmentId: "assign-sample-1",
      assignmentTitle: "Pick & Roll Drop Coverage Film Review",
      assignmentType: "FILM_STUDY",
      priority: "HIGH",
      athleteId: "athlete-01",
      athleteName: "Marcus Vance (#4)",
      athleteEmail: "marcus.vance@courtiq.test",
      score: 100,
      submittedAt: new Date(Date.now() - 7200000).toISOString(),
      answers: {
        athleteNotes: "Watched the 4 clips. Horns action needs guard to fight over screen aggressively so the big can contest mid-range floater.",
      },
    },
    {
      id: "sub-pending-02",
      assignmentId: "assign-sample-2",
      assignmentTitle: "Ankle Dorsiflexion & Landing Mechanics Test",
      assignmentType: "MOVEMENT_ASSESSMENT",
      priority: "NORMAL",
      athleteId: "athlete-02",
      athleteName: "Elena Rostova (#7)",
      athleteEmail: "elena.rostova@courtiq.test",
      score: 90,
      submittedAt: new Date(Date.now() - 14400000).toISOString(),
      answers: {
        athleteNotes: "Recorded 3 jump attempts. Ground contact time felt responsive on right foot.",
      },
    },
  ],
  recentActivity: [
    {
      id: "act-01",
      type: "SUBMISSION_RECEIVED",
      assignmentTitle: "Pick & Roll Drop Coverage Film Review",
      athleteName: "Marcus Vance",
      status: "SUBMITTED",
      score: 100,
      timestamp: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "act-02",
      type: "REVIEW_COMPLETED",
      assignmentTitle: "Spain Action Walkthrough",
      athleteName: "David Kim",
      status: "REVIEWED",
      score: 95,
      timestamp: new Date(Date.now() - 28800000).toISOString(),
    },
    {
      id: "act-03",
      type: "SUBMISSION_RECEIVED",
      assignmentTitle: "Ankle Dorsiflexion & Landing Mechanics",
      athleteName: "Elena Rostova",
      status: "SUBMITTED",
      score: 90,
      timestamp: new Date(Date.now() - 14400000).toISOString(),
    },
  ],
};

export default function CoachPage() {
  const qc = useQueryClient();
  const [activeTeamId] = useState<string>("team-demo-01");
  const [localData, setLocalData] = useState<CoachDashboardData>(SAMPLE_DASHBOARD_DATA);

  // Query dashboard
  const { data: fetchedData } = useQuery<CoachDashboardData>({
    queryKey: ["coach-dashboard", activeTeamId],
    queryFn: () => api<CoachDashboardData>(`/teams/${activeTeamId}/coach-dashboard`),
    enabled: !!activeTeamId && activeTeamId !== "team-demo-01",
    retry: false,
  });

  const dashboardData = fetchedData || localData;

  const reviewMutation = useMutation({
    mutationFn: async ({
      submissionId,
      review,
    }: {
      submissionId: string;
      review: { status: SubmissionStatus; coachNotes?: string; score?: number };
    }) => {
      if (activeTeamId === "team-demo-01") {
        setLocalData((prev) => {
          const reviewedItem = prev.reviewQueue.find((q) => q.id === submissionId);
          const remaining = prev.reviewQueue.filter((q) => q.id !== submissionId);
          return {
            ...prev,
            openReviewCount: Math.max(0, prev.openReviewCount - 1),
            reviewQueue: remaining,
            recentActivity: reviewedItem
              ? [
                  {
                    id: "act-" + Date.now(),
                    type: "REVIEW_COMPLETED",
                    assignmentTitle: reviewedItem.assignmentTitle,
                    athleteName: reviewedItem.athleteName,
                    status: review.status,
                    score: review.score ?? reviewedItem.score,
                    timestamp: new Date().toISOString(),
                  },
                  ...prev.recentActivity,
                ]
              : prev.recentActivity,
          };
        });
        return;
      }
      return api(`/submissions/${submissionId}/review`, {
        method: "PUT",
        body: JSON.stringify(review),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coach-dashboard", activeTeamId] });
      qc.invalidateQueries({ queryKey: ["assignments", activeTeamId] });
    },
  });

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      <CoachDashboard
        data={dashboardData}
        onReviewSubmission={async (submissionId, review) => {
          await reviewMutation.mutateAsync({ submissionId, review });
        }}
      />
    </div>
  );
}
