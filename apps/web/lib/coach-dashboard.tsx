"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, StatCard } from "@courtiq/design-system";

export type AssignmentPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type SubmissionStatus = "SUBMITTED" | "REVIEWED" | "REVISION_REQUESTED";

export interface ReviewQueueItem {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentType: string;
  priority: AssignmentPriority;
  athleteId: string;
  athleteName: string;
  athleteEmail: string;
  score?: number | null;
  submittedAt: string;
  answers?: {
    selectedOptions?: Record<string, number>;
    athleteNotes?: string;
  };
}

export interface RecentActivityItem {
  id: string;
  type: string;
  assignmentTitle: string;
  athleteName: string;
  status: string;
  score?: number | null;
  timestamp: string;
}

export interface CoachDashboardData {
  teamId: string;
  activeAssignmentCount: number;
  openReviewCount: number;
  overdueCount: number;
  squadAdherenceRate: number;
  reviewQueue: ReviewQueueItem[];
  recentActivity: RecentActivityItem[];
}

export interface CoachDashboardProps {
  data: CoachDashboardData;
  onReviewSubmission?: (
    submissionId: string,
    review: { status: SubmissionStatus; coachNotes?: string; score?: number }
  ) => Promise<void>;
}

export function CoachDashboard({ data, onReviewSubmission }: CoachDashboardProps) {
  const [selectedReview, setSelectedReview] = useState<ReviewQueueItem | null>(null);
  const [coachNotes, setCoachNotes] = useState("");
  const [overrideScore, setOverrideScore] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenReview = (item: ReviewQueueItem) => {
    setSelectedReview(item);
    setCoachNotes("");
    setOverrideScore(item.score ?? undefined);
  };

  const handleCloseReview = () => {
    setSelectedReview(null);
    setCoachNotes("");
  };

  const handleSaveReview = async (status: SubmissionStatus) => {
    if (!selectedReview || !onReviewSubmission) return;
    setIsSubmitting(true);
    try {
      await onReviewSubmission(selectedReview.id, {
        status,
        coachNotes: coachNotes.trim() || undefined,
        score: overrideScore,
      });
      handleCloseReview();
    } finally {
      setIsSubmitting(false);
    }
  };

  const priorityColor: Record<AssignmentPriority, "danger" | "brand" | "neutral" | "success" | "warning" | "info"> = {
    LOW: "neutral",
    NORMAL: "neutral",
    HIGH: "warning",
    URGENT: "danger",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
            Coach Command Center
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--muted-foreground)", fontSize: 14 }}>
            Squad adherence, closed-loop review queue, and athlete accountability.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href={`/assignments?teamId=${data.teamId}`}>
            <Button variant="secondary">View All Assignments</Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <StatCard
          label="Review Queue"
          value={data.openReviewCount}
          hint="Submissions awaiting evaluation"
        />
        <StatCard
          label="Active Assignments"
          value={data.activeAssignmentCount}
          hint="Published to squad"
        />
        <StatCard
          label="Overdue Tasks"
          value={data.overdueCount}
          hint="Past due deadline"
        />
        <StatCard
          label="Squad Adherence"
          value={`${data.squadAdherenceRate}%`}
          hint="Completion & compliance rate"
        />
      </div>

      {/* Squad Adherence Visual Bar */}
      <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600 }}>
          <span>Squad Preparation & Film Adherence</span>
          <span style={{ color: data.squadAdherenceRate >= 80 ? "#22c55e" : "#f59e0b" }}>
            {data.squadAdherenceRate}% compliance
          </span>
        </div>
        <div style={{ width: "100%", height: 10, borderRadius: 5, backgroundColor: "var(--accent)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, Math.max(0, data.squadAdherenceRate))}%`,
              backgroundColor: data.squadAdherenceRate >= 80 ? "#22c55e" : "#f59e0b",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </Card>

      {/* Two Column Layout: Review Queue (Primary) and Recent Activity (Secondary) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Left Column: Review Queue */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              Pending Athlete Submissions ({data.reviewQueue.length})
            </h2>
          </div>

          {data.reviewQueue.length === 0 ? (
            <EmptyState
              title="Review queue is clear!"
              description="All athlete submissions have been reviewed and evaluated. Great work keeping the feedback loop tight!"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.reviewQueue.map((item) => (
                <Card
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{item.assignmentTitle}</span>
                      <Badge variant={priorityColor[item.priority]}>{item.priority}</Badge>
                      <Badge variant="neutral">{item.assignmentType}</Badge>
                    </div>

                    <div style={{ display: "flex", gap: 12, fontSize: 13, color: "var(--muted-foreground)" }}>
                      <span>Athlete: <strong style={{ color: "var(--foreground)" }}>{item.athleteName}</strong></span>
                      <span>Submitted: {new Date(item.submittedAt).toLocaleDateString()}</span>
                      {item.score !== null && item.score !== undefined && (
                        <span>Quiz Score: <strong style={{ color: "#22c55e" }}>{item.score}%</strong></span>
                      )}
                    </div>
                  </div>

                  <div>
                    <Button onClick={() => handleOpenReview(item)}>
                      Evaluate Submission
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Recent Activity Log */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Recent Activity</h2>
          {data.recentActivity.length === 0 ? (
            <Card>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
                No recent activity recorded yet.
              </p>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.recentActivity.map((act) => (
                <Card key={act.id} style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{act.athleteName}</span>
                      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                        {act.assignmentTitle}
                      </span>
                    </div>
                    <Badge variant={act.status === "REVIEWED" ? "success" : "neutral"}>
                      {act.status}
                    </Badge>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-foreground)" }}>
                    {new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Review Modal Dialog */}
      {selectedReview && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--card)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 540,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Submission Evaluation</h2>
                <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                  {selectedReview.assignmentTitle} • {selectedReview.athleteName}
                </span>
              </div>
              <button
                onClick={handleCloseReview}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "var(--muted-foreground)",
                }}
              >
                ×
              </button>
            </div>

            {/* Athlete's submission notes */}
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--accent)" }}>
              <span style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Athlete Reflection / Notes:
              </span>
              <p style={{ margin: 0, fontSize: 13, color: "var(--foreground)" }}>
                {selectedReview.answers?.athleteNotes || "No additional notes provided by athlete."}
              </p>
            </div>

            {/* Score input / adjustment */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                Score (%):
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={overrideScore !== undefined ? overrideScore : ""}
                onChange={(e) => setOverrideScore(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="Enter or override score (0-100)"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Coach Feedback Cues */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                Coach Feedback & Technical Cues:
              </label>
              <textarea
                rows={4}
                placeholder="Provide constructive feedback, key learning points, or adjustments for next practice..."
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  fontSize: 13,
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
              <Button
                variant="ghost"
                disabled={isSubmitting}
                onClick={handleCloseReview}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => handleSaveReview("REVISION_REQUESTED")}
              >
                Request Revision
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={() => handleSaveReview("REVIEWED")}
              >
                Approve & Mark Reviewed
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
