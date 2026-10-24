"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, Input, Select } from "@courtiq/design-system";
import { api, ApiError } from "./api";

export interface CourtActivitySummary {
  courtId: string;
  status: "ACTIVE" | "QUIET" | "PACKED";
  currentHeadcount: number | null;
  currentCondition: "DRY" | "WET" | "MAINTENANCE_NEEDED" | "SNOW_ICE" | null;
  lastReportedAt: string | null;
  busiestDays: string[];
  hourlyHeatmap: Array<{
    hour: number;
    label: string;
    relativeVolume: number;
  }>;
}

const STATUS_CONFIG: Record<
  CourtActivitySummary["status"],
  { label: string; variant: "success" | "warning" | "neutral"; icon: string; desc: string }
> = {
  PACKED: { label: "Packed (15+ ballers)", variant: "warning", icon: "🔥", desc: "Full runs with wait" },
  ACTIVE: { label: "Active Run (6-14 ballers)", variant: "success", icon: "🏀", desc: "Active game underway" },
  QUIET: { label: "Quiet / Open Hoops", variant: "neutral", icon: "⚪", desc: "Good for solo shooting" },
};

const CONDITION_LABELS: Record<string, string> = {
  DRY: "Court Dry & Clean",
  WET: "Wet / Damp Surface",
  MAINTENANCE_NEEDED: "Maintenance Needed (Rim / Net)",
  SNOW_ICE: "Snow / Ice Covered",
};

export function CourtActivityPanel({
  courtId,
  courtName,
}: {
  courtId: string;
  courtName: string;
}) {
  const qc = useQueryClient();
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [headcount, setHeadcount] = useState("10");
  const [condition, setCondition] = useState<"DRY" | "WET" | "MAINTENANCE_NEEDED" | "SNOW_ICE">("DRY");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: activity, isLoading } = useQuery<CourtActivitySummary>({
    queryKey: ["court-activity", courtId],
    queryFn: () => api<CourtActivitySummary>(`/courts/${courtId}/activity`),
    staleTime: 30_000,
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      return api(`/courts/${courtId}/activity/check-ins`, {
        method: "POST",
        body: {
          headcountEstimate: Number(headcount),
          conditionReport: condition,
          notes: notes.trim() ? notes.trim() : undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["court-activity", courtId] });
      setIsCheckInOpen(false);
      setNotes("");
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record check-in.");
      }
    },
  });

  if (isLoading || !activity) {
    return (
      <div style={{ fontSize: "0.85rem", color: "var(--muted)", padding: "8px 0" }}>
        Loading real-time court activity…
      </div>
    );
  }

  const status = STATUS_CONFIG[activity.status];

  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 8,
        padding: "12px 14px",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge variant={status.variant}>
            <span style={{ marginRight: 4 }}>{status.icon}</span>
            {status.label}
          </Badge>
          {activity.currentCondition && (
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              · {CONDITION_LABELS[activity.currentCondition] ?? activity.currentCondition}
            </span>
          )}
        </div>

        <button
          type="button"
          className="secondary"
          style={{ fontSize: "0.8rem", padding: "4px 10px", minHeight: 28 }}
          onClick={() => {
            setError(null);
            setIsCheckInOpen(true);
          }}
        >
          Check-in / Report Court
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.82rem", color: "var(--muted)" }}>
        {activity.currentHeadcount !== null ? (
          <span>
            👥 Headcount: <strong>~{activity.currentHeadcount} players</strong>
          </span>
        ) : (
          <span>👥 No recent check-ins within last 2h</span>
        )}

        {activity.busiestDays.length > 0 && (
          <span>
            📅 Peak days: <strong>{activity.busiestDays.join(", ")}</strong>
          </span>
        )}
      </div>

      {/* Hourly activity heatmap bar */}
      <div>
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 4 }}>
          Typical Hourly Activity Trend (Anonymized)
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(17, 1fr)",
            gap: 3,
            alignItems: "flex-end",
            height: 34,
            padding: "4px 0",
          }}
          title="Relative activity by hour of day (6 AM - 10 PM)"
        >
          {activity.hourlyHeatmap.map((item) => {
            const heightPct = Math.max(12, item.relativeVolume);
            const isPeak = item.relativeVolume >= 70;
            return (
              <div
                key={item.hour}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  height: "100%",
                  justifyContent: "flex-end",
                }}
                title={`${item.label}: ${item.relativeVolume}% typical traffic`}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    backgroundColor: isPeak ? "#f97316" : item.relativeVolume > 30 ? "#38bdf8" : "rgba(255, 255, 255, 0.15)",
                    borderRadius: 2,
                    transition: "height 0.2s ease",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--muted)" }}>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>5 PM</span>
          <span>10 PM</span>
        </div>
      </div>

      {/* Check In / Condition Report Dialog */}
      <Dialog
        open={isCheckInOpen}
        onClose={() => setIsCheckInOpen(false)}
        title={`Check In & Report: ${courtName}`}
        description="Share court status with fellow players. Privacy guaranteed: your identity and timestamps are never exposed."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            checkInMutation.mutate();
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

          <Input
            label="Estimated Headcount (Ballers currently at the court)"
            type="number"
            min={1}
            max={50}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            required
          />

          <Select
            label="Court Surface Condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value as "DRY" | "WET" | "MAINTENANCE_NEEDED" | "SNOW_ICE")}
            options={[
              { value: "DRY", label: "Dry & Good to Play" },
              { value: "WET", label: "Wet / Puddles" },
              { value: "MAINTENANCE_NEEDED", label: "Maintenance Needed (Bent rim, broken net, debris)" },
              { value: "SNOW_ICE", label: "Snow / Ice Covered" },
            ]}
          />

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
              Condition Notes (Optional, max 250 chars)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={250}
              rows={2}
              placeholder="e.g. East rim is missing net, 5v5 full court game going on..."
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCheckInOpen(false)}
              disabled={checkInMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={checkInMutation.isPending}>
              Submit Check-In
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
