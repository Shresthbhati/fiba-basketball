"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CoachAssignments, type AssignmentItem, type AssignmentType, type AssignmentPriority, type ResourceRef } from "../../lib/coach-assignments";
import { api, type Me } from "../../lib/api";

const SAMPLE_ASSIGNMENTS: AssignmentItem[] = [
  {
    id: "assign-sample-1",
    teamId: "team-demo-01",
    coachId: "coach-demo-01",
    title: "Pick & Roll Drop Coverage Film Review",
    description: "Study opponent ball-screen tendencies against high Horns actions. Focus on low-man stunt timing and big man drop depth.",
    type: "FILM_STUDY",
    priority: "HIGH",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    resourceRef: {
      type: "SCOUTING_MONTAGE",
      id: "montage-demo-01",
      title: "Horns PNR Breakdown Reel",
    },
    quizQuestions: [
      {
        id: "q1",
        question: "When the ball screen is set at a 45-degree angle, where does the low-man helper position their feet?",
        options: [
          "At the 3-point line",
          "One foot in the paint with chest to baseline",
          "Behind the offensive center",
          "At half court",
        ],
      },
      {
        id: "q2",
        question: "In drop coverage, the dropping big should remain below what line until the guard recovers?",
        options: [
          "Free throw line extended",
          "Half court line",
          "Baseline out of bounds",
          "Above the 3-point arc",
        ],
      },
    ],
    targetAthleteIds: [],
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    submission: null,
  },
  {
    id: "assign-sample-2",
    teamId: "team-demo-01",
    coachId: "coach-demo-01",
    title: "Ankle Dorsiflexion & Landing Mechanics Test",
    description: "Record bilateral depth jump landings to monitor ground contact time and knee flexion asymmetry.",
    type: "MOVEMENT_ASSESSMENT",
    priority: "NORMAL",
    dueAt: new Date(Date.now() + 172800000).toISOString(),
    resourceRef: {
      type: "ASSESSMENT",
      id: "assess-sample-01",
      title: "Kinematic Jump Assessment Protocol",
    },
    targetAthleteIds: [],
    status: "ACTIVE",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    submission: {
      id: "sub-sample-01",
      status: "REVIEWED",
      score: 95,
      coachNotes: "Landing symmetry was excellent. Maintain upright trunk during deceleration.",
      submittedAt: new Date(Date.now() - 43200000).toISOString(),
      reviewedAt: new Date(Date.now() - 21600000).toISOString(),
    },
  },
  {
    id: "assign-sample-3",
    teamId: "team-demo-01",
    coachId: "coach-demo-01",
    title: "Spain Action 5-on-0 Walkthrough",
    description: "Review tactical diagram for Spain backscreen into shooter roll.",
    type: "DRILL_PRACTICE",
    priority: "LOW",
    dueAt: new Date(Date.now() + 259200000).toISOString(),
    resourceRef: {
      type: "TACTICAL_PLAY",
      id: "play-demo-01",
      title: "Spain Pick & Roll",
    },
    targetAthleteIds: [],
    status: "ACTIVE",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    submission: null,
  },
];

export default function AssignmentsPage() {
  const qc = useQueryClient();
  const [activeTeamId] = useState<string>("team-demo-01");
  const [localAssignments, setLocalAssignments] = useState<AssignmentItem[]>(SAMPLE_ASSIGNMENTS);

  // Authenticated user check
  const { data: me } = useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me").catch(() => null),
  });

  // Query assignments
  const { data: fetchedData } = useQuery<{ items: AssignmentItem[] }>({
    queryKey: ["assignments", activeTeamId],
    queryFn: () => api<{ items: AssignmentItem[] }>(`/teams/${activeTeamId}/assignments`),
    enabled: !!activeTeamId && activeTeamId !== "team-demo-01",
    retry: false,
  });

  const assignments = fetchedData?.items || localAssignments;

  const submitMutation = useMutation({
    mutationFn: async ({
      assignmentId,
      answers,
    }: {
      assignmentId: string;
      answers: { selectedOptions?: Record<string, number>; athleteNotes?: string };
    }) => {
      if (activeTeamId === "team-demo-01") {
        setLocalAssignments((prev) =>
          prev.map((a) =>
            a.id === assignmentId
              ? {
                  ...a,
                  submission: {
                    id: "sub-local-" + Date.now(),
                    status: "SUBMITTED",
                    score: 85,
                    answers,
                    submittedAt: new Date().toISOString(),
                  },
                }
              : a
          )
        );
        return;
      }
      return api(`/assignments/${assignmentId}/submissions`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments", activeTeamId] });
      qc.invalidateQueries({ queryKey: ["coach-dashboard", activeTeamId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string;
      type: AssignmentType;
      priority: AssignmentPriority;
      dueAt?: string;
      resourceRef?: ResourceRef;
    }) => {
      if (activeTeamId === "team-demo-01") {
        const newA: AssignmentItem = {
          id: "assign-" + Date.now(),
          teamId: activeTeamId,
          coachId: me?.id || "coach-local",
          title: payload.title,
          description: payload.description,
          type: payload.type,
          priority: payload.priority,
          dueAt: payload.dueAt,
          resourceRef: payload.resourceRef,
          quizQuestions: [],
          targetAthleteIds: [],
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          submission: null,
        };
        setLocalAssignments((prev) => [newA, ...prev]);
        return;
      }
      return api(`/teams/${activeTeamId}/assignments`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments", activeTeamId] });
      qc.invalidateQueries({ queryKey: ["coach-dashboard", activeTeamId] });
    },
  });

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      <CoachAssignments
        assignments={assignments}
        isCoach={false}
        teamId={activeTeamId}
        onSubmitAssignment={async (assignmentId, answers) => {
          await submitMutation.mutateAsync({ assignmentId, answers });
        }}
        onCreateAssignment={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}
