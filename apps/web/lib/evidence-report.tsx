"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@courtiq/design-system";

export type ClaimType = "OBSERVED" | "DERIVED" | "HYPOTHESIS";
export type CitationType = "CLIP" | "EVENT" | "METRIC";

export interface ReportCitation {
  citationType: CitationType;
  targetId: string;
  gameId?: string | undefined;
  timestampMs?: number | undefined;
  note?: string | undefined;
}

export interface ReportBlock {
  id: string;
  title: string;
  claimType: ClaimType;
  statement: string;
  sampleSize?: number | undefined;
  confidence?: number | undefined;
  citations: ReportCitation[];
}

export interface TacticalReport {
  id: string;
  teamId: string;
  title: string;
  summary?: string | null;
  createdBy: string;
  tags: string[];
  blocks: ReportBlock[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceReportViewProps {
  report: TacticalReport;
  filmBaseUrl?: string;
  onEdit?: () => void;
}

/** Formats milliseconds into mm:ss timestamp display */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export const EvidenceReportView: React.FC<EvidenceReportViewProps> = ({
  report,
  filmBaseUrl = "/film",
  onEdit,
}) => {
  return (
    <div
      data-testid={`tactical-report-${report.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        backgroundColor: "#0d0e12",
        color: "#f8fafc",
        padding: 24,
        borderRadius: 12,
        border: "1px solid #1f2937",
      }}
    >
      {/* Report Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>{report.title}</h2>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: 4,
                backgroundColor: "#1f2937",
                color: "#9ca3af",
                fontFamily: "monospace",
              }}
            >
              v{report.version}
            </span>
          </div>

          {report.summary && (
            <p style={{ margin: "8px 0 0", color: "#9ca3af", fontSize: "0.95rem", maxWidth: 800 }}>
              {report.summary}
            </p>
          )}

          {/* Tags */}
          {report.tags.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {report.tags.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: "0.75rem",
                    padding: "2px 8px",
                    borderRadius: 12,
                    backgroundColor: "#161822",
                    color: "#cbd5e1",
                    border: "1px solid #2d3748",
                  }}
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {onEdit && (
          <button type="button" className="secondary" onClick={onEdit} style={{ fontSize: "0.85rem", padding: "6px 14px" }}>
            Edit Report
          </button>
        )}
      </div>

      {/* Analytical Claim Blocks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {report.blocks.map((block) => (
          <ReportBlockCard key={block.id} block={block} filmBaseUrl={filmBaseUrl} />
        ))}
      </div>
    </div>
  );
};

export const ReportBlockCard: React.FC<{ block: ReportBlock; filmBaseUrl: string }> = ({
  block,
  filmBaseUrl,
}) => {
  // Visual semantics for claim types (Master Spec §6.4)
  const claimConfig = {
    OBSERVED: {
      label: "OBSERVED EVIDENCE",
      variant: "success" as const,
      borderLeft: "4px solid #22c55e",
      badgeBg: "#052e16",
      badgeColor: "#4ade80",
      description: "Directly verified from synchronized game film and official event logs.",
    },
    DERIVED: {
      label: "DERIVED METRIC",
      variant: "info" as const,
      borderLeft: "4px solid #38bdf8",
      badgeBg: "#082f49",
      badgeColor: "#38bdf8",
      description: "Computed statistical aggregation from official match events.",
    },
    HYPOTHESIS: {
      label: "TACTICAL HYPOTHESIS",
      variant: "warning" as const,
      borderLeft: "4px solid #f59e0b",
      badgeBg: "#451a03",
      badgeColor: "#fbbf24",
      description: "Coach tactical inference requiring further film and game verification.",
    },
  }[block.claimType];

  return (
    <div
      data-testid={`report-block-${block.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        borderRadius: 8,
        backgroundColor: "#13141c",
        borderLeft: claimConfig.borderLeft,
        border: "1px solid #1f2937",
      }}
    >
      {/* Block Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>{block.title}</h3>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Claim Type Badge */}
          <span
            data-testid={`claim-type-${block.claimType.toLowerCase()}`}
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 4,
              backgroundColor: claimConfig.badgeBg,
              color: claimConfig.badgeColor,
              letterSpacing: "0.03em",
            }}
          >
            {claimConfig.label}
          </span>

          {/* Sample Size (if applicable) */}
          {block.sampleSize !== undefined && (
            <span
              style={{
                fontSize: "0.75rem",
                padding: "3px 8px",
                borderRadius: 4,
                backgroundColor: "#1f2937",
                color: "#e2e8f0",
                fontFamily: "monospace",
              }}
            >
              n = {block.sampleSize}
            </span>
          )}

          {/* Statistical Confidence (if applicable) */}
          {block.confidence !== undefined && (
            <span
              style={{
                fontSize: "0.75rem",
                padding: "3px 8px",
                borderRadius: 4,
                backgroundColor: "#1f2937",
                color: "#93c5fd",
                fontFamily: "monospace",
              }}
            >
              {Math.round(block.confidence * 100)}% conf
            </span>
          )}
        </div>
      </div>

      {/* Statement Body */}
      <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.5, color: "#e2e8f0" }}>
        {block.statement}
      </p>

      {/* Linked Evidence & Citations */}
      {block.citations.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 }}>
            Linked Evidence ({block.citations.length}):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {block.citations.map((cite, idx) => (
              <div
                key={idx}
                data-testid={`citation-${cite.citationType.toLowerCase()}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 12px",
                  borderRadius: 6,
                  backgroundColor: "#0d0e12",
                  fontSize: "0.82rem",
                  border: "1px solid #1f2937",
                }}
              >
                <Badge variant={cite.citationType === "CLIP" ? "success" : cite.citationType === "EVENT" ? "neutral" : "warning"} size="sm">
                  {cite.citationType}
                </Badge>

                {cite.citationType === "CLIP" && cite.gameId ? (
                  <Link
                    href={`${filmBaseUrl}/${cite.gameId}${cite.timestampMs ? `?t=${Math.floor(cite.timestampMs / 1000)}` : ""}`}
                    style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 600 }}
                  >
                    Play Clip {cite.timestampMs !== undefined ? `(${formatTime(cite.timestampMs)})` : ""}
                  </Link>
                ) : (
                  <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>
                    {cite.targetId} {cite.timestampMs !== undefined ? `(${formatTime(cite.timestampMs)})` : ""}
                  </span>
                )}

                {cite.note && (
                  <span style={{ color: "#9ca3af", marginLeft: "auto", fontSize: "0.8rem", fontStyle: "italic" }}>
                    &ldquo;{cite.note}&rdquo;
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
