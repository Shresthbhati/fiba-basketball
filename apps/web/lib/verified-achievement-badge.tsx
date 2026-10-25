"use client";

import React, { useState } from "react";

export interface VerifiedAchievementItem {
  id: string;
  title: string;
  category: "AWARD" | "CHAMPIONSHIP" | "SELECTION" | "MILESTONE" | string;
  issuer: string;
  verifiedAt: string;
  signature?: string | null | undefined;
  evidenceUrl?: string | null | undefined;
  evidenceRef?: string | null | undefined;
  isRevoked?: boolean | undefined;
  revocationReason?: string | null | undefined;
}

export interface VerifiedAchievementBadgeProps {
  achievement: VerifiedAchievementItem;
  theme?: "dark" | "light" | undefined;
  compact?: boolean | undefined;
}

export function VerifiedAchievementBadge({
  achievement,
  theme = "dark",
  compact = false,
}: VerifiedAchievementBadgeProps) {
  const [showProofModal, setShowProofModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLight = theme === "light";
  const isRevoked = !!achievement.isRevoked;

  const cardBg = isRevoked
    ? isLight ? "#fee2e2" : "rgba(239, 68, 68, 0.12)"
    : isLight ? "#fef9c3" : "rgba(251, 191, 36, 0.1)";

  const borderColor = isRevoked
    ? "rgba(239, 68, 68, 0.4)"
    : "rgba(251, 191, 36, 0.35)";

  const titleColor = isRevoked
    ? isLight ? "#991b1b" : "#fca5a5"
    : isLight ? "#854d0e" : "#fef08a";

  const handleCopySignature = () => {
    if (achievement.signature && typeof navigator !== "undefined") {
      navigator.clipboard.writeText(achievement.signature);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div
        data-testid={`achievement-${achievement.id}`}
        id={`verified-achievement-${achievement.id}`}
        style={{
          background: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          padding: compact ? "6px 10px" : "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: compact ? 13 : 16 }}>{isRevoked ? "⚠️" : "⭐"}</span>
            <strong style={{ fontSize: compact ? 12 : 13, color: titleColor, lineHeight: 1.2 }}>
              {achievement.title}
            </strong>
          </div>

          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 700,
              background: isRevoked ? "rgba(239,68,68,0.2)" : "rgba(251, 191, 36, 0.2)",
              color: isRevoked ? "#ef4444" : "#fbbf24",
            }}
          >
            {isRevoked ? "REVOKED" : achievement.category}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: isLight ? "#475569" : "#94a3b8" }}>
          <span>{achievement.issuer}</span>
          <span>{new Date(achievement.verifiedAt).toLocaleDateString()}</span>
        </div>

        {/* Action strip: Proof verification and evidence */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, fontSize: 11 }}>
          <button
            type="button"
            data-testid={`inspect-proof-btn-${achievement.id}`}
            onClick={() => setShowProofModal(true)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#38bdf8",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              textDecoration: "underline",
              fontSize: 11,
            }}
          >
            {achievement.signature ? "🔒 Verified Proof" : "ℹ️ Details"}
          </button>

          {achievement.evidenceUrl && (
            <a
              href={achievement.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`evidence-link-${achievement.id}`}
              style={{
                color: "#10b981",
                textDecoration: "underline",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
              }}
            >
              🔗 Official Evidence
            </a>
          )}
        </div>
      </div>

      {/* Proof & Cryptographic Signature Inspector Modal */}
      {showProofModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verified Achievement Cryptographic Proof"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "#0f172a",
              color: "#f8fafc",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 14,
              maxWidth: 500,
              width: "100%",
              padding: 24,
              boxSizing: "border-box",
              position: "relative",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: titleColor }}>
                  {achievement.title}
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#94a3b8" }}>
                  Verified by {achievement.issuer}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProofModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: 20,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Status Indicator */}
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: isRevoked ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                border: `1px solid ${isRevoked ? "rgba(239, 68, 68, 0.4)" : "rgba(16, 185, 129, 0.4)"}`,
                marginBottom: 16,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{isRevoked ? "⚠️" : "✓"}</span>
              <strong style={{ color: isRevoked ? "#f87171" : "#34d399" }}>
                {isRevoked
                  ? "ACHIEVEMENT REVOKED BY ISSUING AUTHORITY"
                  : "CRYPTOGRAPHIC INTEGRITY VERIFIED (HMAC-SHA256)"}
              </strong>
            </div>

            {isRevoked && achievement.revocationReason && (
              <div style={{ marginBottom: 14, fontSize: 12, background: "rgba(239, 68, 68, 0.08)", padding: 10, borderRadius: 6, borderLeft: "3px solid #ef4444" }}>
                <strong style={{ color: "#f87171" }}>Revocation Reason:</strong> {achievement.revocationReason}
              </div>
            )}

            {/* Cryptographic Signature Box */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 11, color: "#94a3b8" }}>
                <span>Cryptographic Signature Proof:</span>
                {achievement.signature && (
                  <button
                    type="button"
                    onClick={handleCopySignature}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "none",
                      color: "#38bdf8",
                      borderRadius: 4,
                      padding: "2px 8px",
                      cursor: "pointer",
                      fontSize: 10,
                    }}
                  >
                    {copied ? "Copied!" : "Copy Hash"}
                  </button>
                )}
              </div>
              <code
                style={{
                  display: "block",
                  padding: 8,
                  background: "#020617",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  color: "#cbd5e1",
                }}
              >
                {achievement.signature ?? "Canonical signature pending"}
              </code>
            </div>

            {/* Evidence Link */}
            {achievement.evidenceUrl && (
              <div style={{ marginBottom: 16, fontSize: 12 }}>
                <span style={{ color: "#94a3b8" }}>Official Record Evidence: </span>
                <a
                  href={achievement.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#38bdf8", textDecoration: "underline" }}
                >
                  View Match Verification Record
                </a>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setShowProofModal(false)}
                style={{
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#f8fafc",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
