"use client";

import React, { useState } from "react";
import { SourceBadge } from "@courtiq/design-system";
import { SkeletonPlayer } from "./skeleton-player";

export interface CoachFeedbackItem {
  id: string;
  authorId: string;
  authorRole: string;
  notes: string;
  cues: string[];
  suggestedDrillId?: string | null;
  createdAt: string;
}

export interface ShareGrantItem {
  id: string;
  assessmentId: string;
  athleteId: string;
  granteeId: string;
  granteeName?: string | null;
  role: string;
  revokedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface DetailedAssessment {
  id: string;
  userId: string;
  protocol: "BODYWEIGHT_SQUAT" | "COUNTERMOVEMENT_JUMP" | "SHOOTING_MECHANICS" | "LANDING_STABILITY";
  status: "ACCEPTED" | "NEEDS_REVIEW" | "ABSTAINED";
  sourceType: string;
  confidence: number | null;
  modelVersion: string;
  protocolVersion: string;
  repCount: number;
  metrics: {
    repetitions?: Array<{
      repNumber: number;
      depth: "BELOW_PARALLEL" | "PARALLEL" | "PARTIAL";
      minKneeAngleDeg: number;
      durationS?: number;
      torsoLeanDeg?: number;
    }>;
    jumpMetric?: {
      flightTimeS: number;
      jumpHeightCm: number;
      landingSymmetryScore?: number;
    };
    jumpHeightCm?: number;
    flightTimeS?: number;
  };
  criteriaUnmeasurable: string[];
  feedback: string[];
  abstainReason?: string | null;
  coachFeedback?: CoachFeedbackItem[];
  createdAt: string;
}

export interface AssessmentReviewProps {
  assessment: DetailedAssessment;
  shareGrants?: ShareGrantItem[];
  isOwner?: boolean;
  onAddFeedback?: (notes: string, cues: string[]) => Promise<void>;
  onCreateGrant?: (granteeEmail: string, role: string) => Promise<void>;
  onRevokeGrant?: (grantId: string) => Promise<void>;
  onStatusChange?: (status: "ACCEPTED" | "NEEDS_REVIEW") => Promise<void>;
}

export const AssessmentReview: React.FC<AssessmentReviewProps> = ({
  assessment,
  shareGrants = [],
  isOwner = true,
  onAddFeedback,
  onCreateGrant,
  onRevokeGrant,
  onStatusChange,
}) => {
  const [activeTab, setActiveTab] = useState<"findings" | "coach" | "sharing">("findings");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackCues, setFeedbackCues] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("COACH");
  const [submittingShare, setSubmittingShare] = useState(false);

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackNotes.trim() || !onAddFeedback) return;
    setSubmittingFeedback(true);
    try {
      const cues = feedbackCues.split(",").map((c) => c.trim()).filter(Boolean);
      await onAddFeedback(feedbackNotes.trim(), cues);
      setFeedbackNotes("");
      setFeedbackCues("");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim() || !onCreateGrant) return;
    setSubmittingShare(true);
    try {
      await onCreateGrant(shareEmail.trim(), shareRole);
      setShareEmail("");
    } finally {
      setSubmittingShare(false);
    }
  };

  const repetitions = assessment.metrics.repetitions ?? [];
  const jumpHeight = assessment.metrics.jumpMetric?.jumpHeightCm ?? assessment.metrics.jumpHeightCm;
  const flightTime = assessment.metrics.jumpMetric?.flightTimeS ?? assessment.metrics.flightTimeS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Assessment Header Card */}
      <div
        style={{
          border: "1px solid var(--cq-border, #e5e7eb)",
          borderRadius: 12,
          padding: 24,
          background: "var(--cq-card-bg, #ffffff)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: assessment.status === "ACCEPTED" ? "#dcfce7" : assessment.status === "ABSTAINED" ? "#fef3c7" : "#e0f2fe",
                  color: assessment.status === "ACCEPTED" ? "#166534" : assessment.status === "ABSTAINED" ? "#92400e" : "#0369a1",
                }}
              >
                {assessment.status}
              </span>
              <SourceBadge
                sourceType="CV_ESTIMATE"
                confidence={assessment.confidence !== null ? assessment.confidence : undefined}
              />
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Model: <code>{assessment.modelVersion}</code>
              </span>
            </div>

            <h1 style={{ margin: "0 0 6px 0", fontSize: 26, fontWeight: 800 }}>
              {assessment.protocol === "BODYWEIGHT_SQUAT" ? "Bodyweight Squat Assessment" : "Countermovement Jump (CMJ)"}
            </h1>
            <span style={{ fontSize: 13, color: "var(--cq-text-muted, #6b7280)" }}>
              Recorded on {new Date(assessment.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}
            </span>
          </div>

          {/* Quick Athlete Status Toggle */}
          {isOwner && onStatusChange && assessment.status !== "ABSTAINED" && (
            <div style={{ display: "flex", gap: 8 }}>
              {assessment.status !== "ACCEPTED" ? (
                <button
                  type="button"
                  onClick={() => onStatusChange("ACCEPTED")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: "#166534",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  ✓ Accept Assessment
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onStatusChange("NEEDS_REVIEW")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Request Review
                </button>
              )}
            </div>
          )}
        </div>

        {/* Abstention Notice if applicable */}
        {assessment.status === "ABSTAINED" && (
          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 8,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#92400e",
              fontSize: 14,
            }}
          >
            <strong>Measurement Abstained:</strong> {assessment.abstainReason || "Sufficient confidence threshold not met."}
            {assessment.criteriaUnmeasurable.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Unmeasurable criteria: {assessment.criteriaUnmeasurable.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Review Workbench: Left column Skeleton Player, Right column Details & Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 1.3fr) minmax(300px, 1fr)", gap: 20 }}>
        {/* Left Column: Interactive Skeleton Player */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SkeletonPlayer protocol={assessment.protocol} />
        </div>

        {/* Right Column: Tabbed Panels (Findings, Coach Feedback, Sharing) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--cq-border, #e5e7eb)" }}>
            <button
              type="button"
              onClick={() => setActiveTab("findings")}
              style={{
                padding: "8px 14px",
                border: "none",
                background: "none",
                borderBottom: activeTab === "findings" ? "2px solid #1e3a8a" : "2px solid transparent",
                fontWeight: activeTab === "findings" ? 700 : 500,
                color: activeTab === "findings" ? "#1e3a8a" : "#6b7280",
                cursor: "pointer",
              }}
            >
              Kinematic Findings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("coach")}
              style={{
                padding: "8px 14px",
                border: "none",
                background: "none",
                borderBottom: activeTab === "coach" ? "2px solid #1e3a8a" : "2px solid transparent",
                fontWeight: activeTab === "coach" ? 700 : 500,
                color: activeTab === "coach" ? "#1e3a8a" : "#6b7280",
                cursor: "pointer",
              }}
            >
              Coach Feedback ({assessment.coachFeedback?.length ?? 0})
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => setActiveTab("sharing")}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  background: "none",
                  borderBottom: activeTab === "sharing" ? "2px solid #1e3a8a" : "2px solid transparent",
                  fontWeight: activeTab === "sharing" ? 700 : 500,
                  color: activeTab === "sharing" ? "#1e3a8a" : "#6b7280",
                  cursor: "pointer",
                }}
              >
                Coach Sharing ({shareGrants.filter((g) => !g.revokedAt).length})
              </button>
            )}
          </div>

          {/* TAB 1: FINDINGS */}
          {activeTab === "findings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {assessment.protocol === "BODYWEIGHT_SQUAT" && repetitions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <h3 style={{ fontSize: 15, margin: 0, fontWeight: 700 }}>Repetition Breakdown ({repetitions.length} reps)</h3>
                  {repetitions.map((rep) => (
                    <div
                      key={rep.repNumber}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        background: "#ffffff",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Repetition #{rep.repNumber}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          Min Knee Angle: <strong>{rep.minKneeAngleDeg}°</strong>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: rep.depth === "BELOW_PARALLEL" ? "#dcfce7" : "#eff6ff",
                          color: rep.depth === "BELOW_PARALLEL" ? "#166534" : "#1e40af",
                        }}
                      >
                        {rep.depth.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {assessment.protocol === "COUNTERMOVEMENT_JUMP" && jumpHeight !== undefined && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                    Vertical Jump Displacement
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#1e3a8a", marginTop: 4 }}>
                    {jumpHeight} <span style={{ fontSize: 14, fontWeight: 500 }}>cm</span>
                  </div>
                  {flightTime !== undefined && (
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
                      Flight Time: <strong>{flightTime}s</strong> (kinematic formula derived)
                    </div>
                  )}
                </div>
              )}

              {assessment.feedback.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <h4 style={{ fontSize: 14, margin: "0 0 6px 0", fontWeight: 700 }}>Automated CV Observations</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#334155" }}>
                    {assessment.feedback.map((f, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COACH FEEDBACK */}
          {activeTab === "coach" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {assessment.coachFeedback && assessment.coachFeedback.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {assessment.coachFeedback.map((fb) => (
                    <div
                      key={fb.id}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        border: "1px solid #bfdbfe",
                        background: "#eff6ff",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1e40af" }}>
                          {fb.authorRole === "COACH" ? "Coach Feedback" : "Athlete Note"}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          {new Date(fb.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p style={{ margin: "0 0 8px 0", fontSize: 14, color: "#1e293b", lineHeight: 1.4 }}>
                        {fb.notes}
                      </p>
                      {fb.cues && fb.cues.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {fb.cues.map((cue, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 12,
                                background: "#ffffff",
                                border: "1px solid #93c5fd",
                                color: "#1d4ed8",
                              }}
                            >
                              💡 {cue}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: "center", color: "#6b7280", border: "1px dashed #cbd5e1", borderRadius: 8 }}>
                  No coach feedback recorded yet.
                </div>
              )}

              {/* Add Feedback Form */}
              {onAddFeedback && (
                <form
                  onSubmit={handleFeedbackSubmit}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                  }}
                >
                  <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700 }}>Add Technical Coaching Feedback</h4>
                  <textarea
                    rows={3}
                    required
                    placeholder="Enter technique observations, adjustments, or drill recommendations..."
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                      marginBottom: 8,
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Technical cues (comma separated, e.g. Drive through midfoot, High chest)"
                    value={feedbackCues}
                    onChange={(e) => setFeedbackCues(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      fontSize: 12,
                      marginBottom: 10,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: "#1e3a8a",
                      color: "#ffffff",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {submittingFeedback ? "Submitting..." : "Submit Feedback"}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: SHARING GRANTS (Athlete Owner Only) */}
          {activeTab === "sharing" && isOwner && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, margin: "0 0 6px 0", fontWeight: 700 }}>Active Sharing Grants</h3>
                <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "#64748b" }}>
                  Grant your team coach or strength specialist access to review this assessment. You can revoke access immediately at any time (ADR-0010).
                </p>

                {shareGrants.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "#6b7280", border: "1px dashed #cbd5e1", borderRadius: 8 }}>
                    Not shared with anyone yet. Private by default.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {shareGrants.map((grant) => {
                      const isRevoked = !!grant.revokedAt;
                      return (
                        <div
                          key={grant.id}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            background: isRevoked ? "#f1f5f9" : "#ffffff",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              {grant.granteeName || `User ${grant.granteeId.slice(0, 8)}`}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>
                              Role: {grant.role} · {isRevoked ? "Revoked" : "Active"}
                            </div>
                          </div>

                          {!isRevoked && onRevokeGrant && (
                            <button
                              type="button"
                              onClick={() => onRevokeGrant(grant.id)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 4,
                                border: "1px solid #fca5a5",
                                background: "#fef2f2",
                                color: "#b91c1c",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Revoke Access
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Share With Coach Form */}
              {onCreateGrant && (
                <form
                  onSubmit={handleShareSubmit}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                  }}
                >
                  <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700 }}>Grant Access to Coach or Trainer</h4>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      type="email"
                      required
                      placeholder="Coach email address..."
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        fontSize: 13,
                      }}
                    />
                    <select
                      value={shareRole}
                      onChange={(e) => setShareRole(e.target.value)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        fontSize: 13,
                      }}
                    >
                      <option value="COACH">Coach</option>
                      <option value="TRAINER">S&C Trainer</option>
                      <option value="HEALTH_PRO">Health Pro</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={submittingShare}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: "#1e3a8a",
                      color: "#ffffff",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {submittingShare ? "Granting..." : "Grant Access"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
