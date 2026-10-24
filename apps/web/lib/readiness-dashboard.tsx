"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  StatCard,
} from "@courtiq/design-system";
import { api } from "./api";

export interface ReadinessSummary {
  athleteId: string;
  athleteName: string;
  asOf: string;
  workload: {
    acuteVolumeKg: number;
    chronicWeeklyVolumeKg: number;
    acwr: number | null;
    acuteSessionsCount: number;
    chronicSessionsCount: number;
    averageRpe7d: number | null;
    averageRpe28d: number | null;
    volumeUnit: "kg";
    provenance: string;
  };
  safetyStop: {
    active: boolean;
    reason: string | null;
    advice: string | null;
  };
  combineSignature: {
    standingVerticalCm: number | null;
    maxVerticalCm: number | null;
    threeQuarterSprintSec: number | null;
    laneAgilitySec: number | null;
    proAgilitySec: number | null;
    yoyoLevel: number | null;
    latestTestedDate: string | null;
    provenance: string;
  };
  gamePerformance: {
    gamesCount: number;
    totalMinutes: number | null;
    points: number;
    pointsPerMinute: number | null;
    trueShootingPercentage: number | null;
    turnovers: number;
    provenance: string;
  };
  correlationalObservations: Array<{
    category: "VOLUME_PACING" | "READINESS_OBSERVATION" | "PERFORMANCE_EFFICIENCY";
    observation: string;
    sampleSize: string;
    confidence: "OBSERVED" | "DERIVED";
  }>;
  complianceNotice: string;
}

export function ReadinessDashboard() {
  const readinessQuery = useQuery<ReadinessSummary>({
    queryKey: ["readiness-summary"],
    queryFn: () => api<ReadinessSummary>("/me/readiness"),
  });

  if (readinessQuery.isLoading) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        <LoadingState message="Calculating workload distribution & readiness correlations..." />
      </div>
    );
  }

  if (readinessQuery.isError) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        <ErrorState
          title="Unable to load readiness summary"
          message="Please ensure you are logged in and your connection is active."
          onRetry={() => readinessQuery.refetch()}
        />
      </div>
    );
  }

  const data = readinessQuery.data!;
  const acwr = data.workload.acwr;

  const getAcwrBadge = (val: number | null) => {
    if (val === null) return <Badge variant="neutral">No Baseline</Badge>;
    if (val >= 0.8 && val <= 1.3) return <Badge variant="success">Optimal Sweet Spot ({val})</Badge>;
    if (val > 1.4) return <Badge variant="warning">Workload Spike ({val})</Badge>;
    return <Badge variant="info">Low Volume ({val})</Badge>;
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
            Training-to-Game Readiness & Correlation
          </h1>
          <Badge variant="brand">Athlete: {data.athleteName}</Badge>
        </div>
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 15 }}>
          Correlational analysis evaluating periodized training volume, combine power benchmarks, and competition efficiency.
        </p>
      </div>

      {/* Safety Stop Notice (Spec §5.3) */}
      {data.safetyStop.active && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #ef4444",
            borderRadius: 8,
            padding: "16px 20px",
            color: "#991b1b",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 16 }}>
            ⚠️ SAFETY STOP ACTIVE
          </div>
          <div style={{ marginTop: 6, fontSize: 14 }}>
            {data.safetyStop.reason}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#7f1d1d" }}>
            {data.safetyStop.advice}
          </div>
        </div>
      )}

      {/* ADR-0009 Compliance Banner */}
      <div
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 16px",
          fontSize: 13,
          color: "var(--muted)",
          marginBottom: 24,
        }}
      >
        🛡️ <strong>ADR-0009 Principle:</strong> {data.complianceNotice}
      </div>

      {/* Section 1: Workload & ACWR */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Workload Distribution & ACWR</h2>
          {getAcwrBadge(acwr)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <StatCard
            label="Acute Volume (7d)"
            value={`${data.workload.acuteVolumeKg.toLocaleString()} kg`}
            hint={`${data.workload.acuteSessionsCount} sessions completed`}
          />
          <StatCard
            label="Chronic Weekly Volume (28d)"
            value={`${data.workload.chronicWeeklyVolumeKg.toLocaleString()} kg`}
            hint={`${data.workload.chronicSessionsCount} sessions in 4-wk cycle`}
          />
          <StatCard
            label="ACWR Ratio"
            value={acwr !== null ? String(acwr) : "N/A"}
            hint="Volume distribution index"
          />
          <StatCard
            label="Average Session RPE"
            value={data.workload.averageRpe7d !== null ? `${data.workload.averageRpe7d} / 10` : "N/A"}
            hint={`4-wk avg: ${data.workload.averageRpe28d ?? "N/A"}`}
          />
        </div>
      </Card>

      {/* Section 2: Combine Power & Game Performance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Combine Benchmarks */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Combine Signature</h3>
            <Badge variant="brand">SENSOR</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatCard
              label="Max Vertical"
              value={data.combineSignature.maxVerticalCm !== null ? `${data.combineSignature.maxVerticalCm} cm` : "Not tested"}
              hint="Flight time / Vertec"
            />
            <StatCard
              label="3/4 Sprint"
              value={data.combineSignature.threeQuarterSprintSec !== null ? `${data.combineSignature.threeQuarterSprintSec}s` : "Not tested"}
              hint="Dual-beam timing gates"
            />
            <StatCard
              label="Lane Agility"
              value={data.combineSignature.laneAgilitySec !== null ? `${data.combineSignature.laneAgilitySec}s` : "Not tested"}
              hint="Cone drill agility"
            />
            <StatCard
              label="Yo-Yo IR1"
              value={data.combineSignature.yoyoLevel !== null ? `Level ${data.combineSignature.yoyoLevel}` : "Not tested"}
              hint="Conditioning benchmark"
            />
          </div>
        </Card>

        {/* Official Game Performance */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Competition Efficiency</h3>
            <Badge variant="brand">OFFICIAL</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatCard
              label="Recent Games"
              value={`${data.gamePerformance.gamesCount}`}
              hint="Finished official games (30d)"
            />
            <StatCard
              label="Total Points"
              value={`${data.gamePerformance.points}`}
              hint="Official match events"
            />
            <StatCard
              label="True Shooting"
              value={data.gamePerformance.trueShootingPercentage !== null ? `${data.gamePerformance.trueShootingPercentage}%` : "N/A"}
              hint="PTS / (2 * (FGA + 0.44 * FTA))"
            />
            <StatCard
              label="Turnovers"
              value={`${data.gamePerformance.turnovers}`}
              hint="Live-ball / Dead-ball TOs"
            />
          </div>
        </Card>
      </div>

      {/* Section 3: Correlational Observations */}
      <Card>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>
          Empirical Correlational Observations
        </h3>

        {data.correlationalObservations.length === 0 ? (
          <EmptyState
            title="Awaiting further session data"
            description="Log at least 2 workouts and complete an official match to generate evidence-backed correlations."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.correlationalObservations.map((obs, idx) => (
              <div
                key={idx}
                style={{
                  padding: "12px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Badge variant="brand">{obs.category.replace(/_/g, " ")}</Badge>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Basis: {obs.sampleSize} ({obs.confidence})
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "var(--foreground)" }}>
                  {obs.observation}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
