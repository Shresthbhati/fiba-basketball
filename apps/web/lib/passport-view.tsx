"use client";

import React from "react";
import { VerificationBadge, SourceBadge } from "@courtiq/design-system";

export interface PassportAchievement {
  id: string;
  title: string;
  category: string;
  issuer: string;
  verifiedAt: string;
}

export interface PassportLine {
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  fouls: number;
}

export interface PassportData {
  athlete: {
    displayName: string;
  };
  grant: {
    token: string;
    label?: string | null;
    expiresAt?: string | null;
    permissions: {
      includeAverages: boolean;
      includeShootingSplits: boolean;
      includeMinutes: boolean;
      includeGameLog: boolean;
      includeBiometrics: boolean;
    };
  };
  provenance: {
    matchStatsSource: "OFFICIAL";
    verifiedAchievementsCount: number;
  };
  achievements: PassportAchievement[];
  career: {
    games: number;
    totals: PassportLine;
    perGame?: {
      points: number;
      rebounds: number;
      assists: number;
      turnovers: number;
      fouls: number;
    } | null;
    minutes?: {
      games: number;
      total: number;
      perGame: number;
    } | null;
    competitions: Array<{
      name: string;
      games: number;
      totals: PassportLine;
      recent: Array<{
        matchId: string;
        opponent: string;
        scheduledAt: string | null;
        line: PassportLine;
        seconds: number | null;
      }>;
    }>;
  };
  biometrics?: Array<{
    protocol: string;
    status: string;
    sourceType: string;
    confidence: number | null;
    repCount: number;
    metrics: Record<string, unknown>;
    createdAt: string;
  }> | null;
}

export const PassportView: React.FC<{ data: PassportData }> = ({ data }) => {
  const { athlete, grant, achievements, career, biometrics } = data;
  const p = grant.permissions;

  const shootingStr = (l: PassportLine) => {
    if (!p.includeShootingSplits) return null;
    const fgPct = l.fga > 0 ? Math.round((l.fgm / l.fga) * 100) : 0;
    const tpPct = l.tpa > 0 ? Math.round((l.tpm / l.tpa) * 100) : 0;
    const ftPct = l.fta > 0 ? Math.round((l.ftm / l.fta) * 100) : 0;
    return `${l.fgm}/${l.fga} FG (${fgPct}%) · ${l.tpm}/${l.tpa} 3P (${tpPct}%) · ${l.ftm}/${l.fta} FT (${ftPct}%)`;
  };

  return (
    <div
      data-testid="athlete-passport-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 780,
        margin: "0 auto",
        padding: 24,
        backgroundColor: "#0d0e12",
        borderRadius: 16,
        color: "#f8fafc",
        border: "1px solid #1f2937",
      }}
    >
      {/* Passport Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 800 }}>{athlete.displayName}</h1>
            <VerificationBadge status="OFFICIAL" size="sm" />
          </div>
          <p style={{ margin: "4px 0 0", color: "#9ca3af", fontSize: "0.9rem" }}>
            Athlete Career Passport · Verified Competition Record
          </p>
        </div>

        {grant.label && (
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              backgroundColor: "#161822",
              color: "#38bdf8",
              fontSize: "0.82rem",
              border: "1px solid #2d3748",
            }}
          >
            {grant.label}
          </span>
        )}
      </div>

      {/* Verified Achievements */}
      {achievements.length > 0 && (
        <section aria-label="Verified Achievements" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#facc15" }}>
            Verified Honors & Achievements ({achievements.length})
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {achievements.map((ach) => (
              <div
                key={ach.id}
                data-testid={`achievement-${ach.id}`}
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  backgroundColor: "#161822",
                  border: "1px solid #374151",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{ach.title}</div>
                <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: 2 }}>{ach.issuer}</div>
                <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 4 }}>
                  Verified: {new Date(ach.verifiedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Official Career Totals */}
      <section aria-label="Career Performance" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Career Performance</h2>
          <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>({career.games} official games)</span>
        </div>

        {/* Highlight Stats Strip */}
        {p.includeAverages && career.perGame && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 8, backgroundColor: "#14151b", border: "1px solid #1f2937", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#f97316" }}>{career.perGame.points}</div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>PTS / Game</div>
            </div>
            <div style={{ padding: 14, borderRadius: 8, backgroundColor: "#14151b", border: "1px solid #1f2937", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#38bdf8" }}>{career.perGame.rebounds}</div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>REB / Game</div>
            </div>
            <div style={{ padding: 14, borderRadius: 8, backgroundColor: "#14151b", border: "1px solid #1f2937", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#4ade80" }}>{career.perGame.assists}</div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>AST / Game</div>
            </div>
            {p.includeMinutes && career.minutes && (
              <div style={{ padding: 14, borderRadius: 8, backgroundColor: "#14151b", border: "1px solid #1f2937", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#cbd5e1" }}>{career.minutes.perGame}</div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>MIN / Game</div>
              </div>
            )}
          </div>
        )}

        {/* Shooting splits (if permitted by grant) */}
        {p.includeShootingSplits && (
          <div
            data-testid="passport-shooting-splits"
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              backgroundColor: "#161822",
              fontSize: "0.88rem",
              color: "#cbd5e1",
            }}
          >
            <strong>Career Shooting:</strong> {shootingStr(career.totals)}
          </div>
        )}
      </section>

      {/* Verified Biometrics (if permitted by grant) */}
      {p.includeBiometrics && biometrics && biometrics.length > 0 && (
        <section aria-label="Verified Athletic Testing" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Verified Athletic Testing</h2>
            <SourceBadge sourceType="CV_ESTIMATE" confidence={biometrics[0]?.confidence ?? undefined} size="sm" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {biometrics.map((b, idx) => (
              <div
                key={idx}
                data-testid={`passport-biometric-${idx}`}
                style={{
                  padding: 14,
                  borderRadius: 8,
                  backgroundColor: "#14151b",
                  border: "1px solid #1f2937",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.92rem", textTransform: "capitalize" }}>
                  {b.protocol.toLowerCase().replace(/_/g, " ")}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {Object.entries(b.metrics).map(([k, v]) => (
                    <span
                      key={k}
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: 4,
                        backgroundColor: "#1f2937",
                        color: "#93c5fd",
                      }}
                    >
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer Provenance Note */}
      <footer style={{ borderTop: "1px solid #1f2937", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: "0.78rem", color: "#6b7280" }}>
        <span>Powered by COURT IQ · Cryptographically Verified Official Event Data</span>
        {grant.expiresAt && <span>Grant expires: {new Date(grant.expiresAt).toLocaleDateString()}</span>}
      </footer>
    </div>
  );
};
