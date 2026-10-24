"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, Select } from "@courtiq/design-system";
import { api, ApiError } from "./api";

export interface HostReliabilityMetrics {
  hostId: string;
  hostName: string;
  totalGamesHosted: number;
  completedGames: number;
  cancelledGames: number;
  completionRatePercent: number;
  reviewsCount: number;
  averageRating: number | null;
  runConfirmationPercent: number | null;
  onTimePercent: number | null;
  reliabilityScore: number;
  hostTier: "PROVEN_COMMUNITY_LEADER" | "RELIABLE_HOST" | "ESTABLISHED_HOST" | "NEW_HOST" | "NEEDS_ATTENTION";
}

const TIER_CONFIG: Record<
  HostReliabilityMetrics["hostTier"],
  { label: string; variant: "brand" | "success" | "info" | "neutral" | "warning"; icon: string }
> = {
  PROVEN_COMMUNITY_LEADER: { label: "Proven Leader", variant: "brand", icon: "🌟" },
  RELIABLE_HOST: { label: "Reliable Host", variant: "success", icon: "🛡️" },
  ESTABLISHED_HOST: { label: "Established", variant: "info", icon: "🏀" },
  NEW_HOST: { label: "New Host", variant: "neutral", icon: "🔰" },
  NEEDS_ATTENTION: { label: "Needs Review", variant: "warning", icon: "⚠️" },
};

export function HostReliabilityBadge({
  hostId,
  showDetails = false,
}: {
  hostId: string;
  showDetails?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: metrics, isLoading } = useQuery<HostReliabilityMetrics>({
    queryKey: ["host-reliability", hostId],
    queryFn: () => api<HostReliabilityMetrics>(`/hosts/${hostId}/reliability`),
    staleTime: 60_000,
  });

  if (isLoading || !metrics) {
    return <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Loading host stats…</span>;
  }

  const tier = TIER_CONFIG[metrics.hostTier];

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Badge variant={tier.variant}>
          <span style={{ marginRight: 4 }}>{tier.icon}</span>
          {tier.label}
        </Badge>
        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          {metrics.reliabilityScore}% reliability
        </span>
        {metrics.averageRating !== null && (
          <span style={{ fontSize: "0.85rem", color: "var(--color-primary-400)" }}>
            ★ {metrics.averageRating.toFixed(1)} ({metrics.reviewsCount})
          </span>
        )}
        {(showDetails || expanded) ? (
          <button
            type="button"
            className="secondary"
            style={{ fontSize: "0.75rem", padding: "2px 6px", minHeight: 24 }}
            onClick={() => setExpanded(false)}
          >
            Hide stats
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            style={{ fontSize: "0.75rem", padding: "2px 6px", minHeight: 24 }}
            onClick={() => setExpanded(true)}
          >
            View stats
          </button>
        )}
      </div>

      {(showDetails || expanded) && (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: "0.8rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 8,
            marginTop: 4,
          }}
        >
          <div>
            <div style={{ color: "var(--muted)" }}>Total Runs Hosted</div>
            <strong>{metrics.totalGamesHosted}</strong>
          </div>
          <div>
            <div style={{ color: "var(--muted)" }}>Completion Rate</div>
            <strong>{metrics.completionRatePercent}%</strong>
          </div>
          <div>
            <div style={{ color: "var(--muted)" }}>Run Confirmed</div>
            <strong>{metrics.runConfirmationPercent !== null ? `${metrics.runConfirmationPercent}%` : "N/A"}</strong>
          </div>
          <div>
            <div style={{ color: "var(--muted)" }}>On-Time Host</div>
            <strong>{metrics.onTimePercent !== null ? `${metrics.onTimePercent}%` : "N/A"}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export interface PostRunReviewModalProps {
  gameId: string;
  gameTitle: string;
  hostName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PostRunReviewModal({
  gameId,
  gameTitle,
  hostName,
  isOpen,
  onClose,
  onSuccess,
}: PostRunReviewModalProps) {
  const qc = useQueryClient();
  const [runHappened, setRunHappened] = useState(true);
  const [rating, setRating] = useState("5");
  const [punctuality, setPunctuality] = useState<"ON_TIME" | "SLIGHTLY_LATE" | "NO_SHOW">("ON_TIME");
  const [competitionMatched, setCompetitionMatched] = useState(true);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      return api(`/pickup/${gameId}/reviews`, {
        method: "POST",
        body: {
          runHappened,
          rating: Number(rating),
          punctuality,
          competitionMatched,
          feedbackNotes: feedbackNotes.trim() ? feedbackNotes.trim() : undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["host-reliability"] });
      onSuccess?.();
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to submit review. Please try again.");
      }
    },
  });

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={`Post-Run Review: ${gameTitle}`}
      description={`Feedback for host ${hostName}. Helps the basketball community find reliable runs.`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          reviewMutation.mutate();
        }}
        style={{ display: "grid", gap: 14 }}
      >
        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              borderRadius: 6,
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={runHappened}
            onChange={(e) => setRunHappened(e.target.checked)}
          />
          <span>Did the run actually happen as posted?</span>
        </label>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
            Overall Host Rating (1-5 Stars)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((stars) => (
              <button
                key={stars}
                type="button"
                className={rating === String(stars) ? "primary" : "secondary"}
                style={{
                  minHeight: 36,
                  minWidth: 44,
                  padding: "6px 12px",
                  fontWeight: 600,
                }}
                onClick={() => setRating(String(stars))}
              >
                ★ {stars}
              </button>
            ))}
          </div>
        </div>

        <Select
          label="Host Punctuality"
          value={punctuality}
          onChange={(e) => setPunctuality(e.target.value as "ON_TIME" | "SLIGHTLY_LATE" | "NO_SHOW")}
          options={[
            { value: "ON_TIME", label: "On time / Early" },
            { value: "SLIGHTLY_LATE", label: "Slightly late (5-15 min)" },
            { value: "NO_SHOW", label: "Host was a no-show" },
          ]}
        />

        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={competitionMatched}
            onChange={(e) => setCompetitionMatched(e.target.checked)}
          />
          <span>Competition level matched expectations</span>
        </label>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
            Community Feedback Notes (Optional)
          </label>
          <textarea
            value={feedbackNotes}
            onChange={(e) => setFeedbackNotes(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Good pace, clean balls, organized runs with subs..."
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 6,
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              fontSize: "0.85rem",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={reviewMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={reviewMutation.isPending}>
            Submit Review
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
