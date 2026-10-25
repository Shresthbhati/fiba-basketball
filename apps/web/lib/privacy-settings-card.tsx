"use client";

import React, { useState, useEffect, useCallback, type FormEvent } from "react";
import { api, ApiError } from "./api";

export interface PrivacyStatusResponse {
  userId: string;
  isErased: boolean;
  erasedAt: string | null;
  dataRetentionDays: number;
  hasActiveExport: boolean;
  latestExport: {
    id: string;
    checksumSha256: string;
    createdAt: string;
    expiresAt: string;
  } | null;
}

export interface ExportArchiveResponse {
  id: string;
  status: string;
  checksumSha256: string;
  expiresAt: string;
  createdAt: string;
  archive: Record<string, unknown>;
}

export function PrivacySettingsCard() {
  const [status, setStatus] = useState<PrivacyStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [latestArchive, setLatestArchive] = useState<ExportArchiveResponse | null>(null);

  // Erasure modal state
  const [showErasureModal, setShowErasureModal] = useState(false);
  const [passwordVerify, setPasswordVerify] = useState("");
  const [erasureReason, setErasureReason] = useState("");
  const [erasing, setErasing] = useState(false);
  const [erasedNotice, setErasedNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<PrivacyStatusResponse>("/privacy/status");
      setStatus(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load privacy status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleExportData() {
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api<ExportArchiveResponse>("/privacy/export", { method: "POST" });
      setLatestArchive(res);
      setSuccess("Your personal data archive was generated successfully!");
      await loadStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate data export");
    } finally {
      setExporting(false);
    }
  }

  function handleDownloadJson(archive: Record<string, unknown>, checksum: string) {
    const jsonStr = JSON.stringify(archive, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `courtiq-data-archive-${checksum.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleConfirmErasure(e: FormEvent) {
    e.preventDefault();
    if (!passwordVerify) return;
    setErasing(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; message: string }>("/privacy/erasure", {
        method: "POST",
        body: { passwordVerify, reason: erasureReason || undefined },
      });
      setShowErasureModal(false);
      setErasedNotice(res.message);
      // Wait 3 seconds and redirect to login
      setTimeout(() => {
        window.location.href = "/login";
      }, 3500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Account erasure failed");
    } finally {
      setErasing(false);
    }
  }

  if (erasedNotice) {
    return (
      <div
        role="alert"
        style={{
          background: "#450a0a",
          border: "1px solid #dc2626",
          borderRadius: "8px",
          padding: "1.5rem",
          color: "#fecaca",
          textAlign: "center",
          display: "grid",
          gap: "1rem",
        }}
      >
        <h3 style={{ margin: 0, color: "#fff" }}>Account &amp; Data Erased</h3>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>{erasedNotice}</p>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "#f87171" }}>
          Redirecting to home page…
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.75)",
        border: "1px solid #1e293b",
        borderRadius: "8px",
        padding: "1.5rem",
        display: "grid",
        gap: "1.25rem",
      }}
    >
      <div>
        <h3 style={{ margin: "0 0 0.5rem 0", color: "#f8fafc", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>🛡️ Privacy &amp; Data Rights Governance</span>
          <span style={{ fontSize: "0.75rem", background: "#0284c7", color: "#fff", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600 }}>
            GDPR &amp; CCPA Compliant
          </span>
        </h3>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
          COURT IQ adheres strictly to international privacy frameworks. You have full transparency and sovereignty over your biometric, training, video, and personal records.
        </p>
      </div>

      {error && (
        <div role="alert" style={{ background: "#450a0a", border: "1px solid #dc2626", color: "#fca5a5", padding: "0.5rem 0.75rem", borderRadius: "6px", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{ background: "#052e16", border: "1px solid #16a34a", color: "#86efac", padding: "0.5rem 0.75rem", borderRadius: "6px", fontSize: "0.85rem" }}>
          {success}
        </div>
      )}

      {/* Section 1: Right to Access & Data Portability */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "6px", padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <div>
          <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.95rem" }}>
            📥 Right to Access &amp; Data Portability (Article 15 &amp; 20)
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.25rem" }}>
            Export all of your athletic assessments, workout history, wellness logs, verified achievements, and court contributions in machine-readable JSON format.
          </div>
        </div>

        {status?.latestExport && (
          <div style={{ background: "#1e293b", padding: "0.6rem 0.75rem", borderRadius: "4px", fontSize: "0.75rem", color: "#cbd5e1", display: "grid", gap: "0.25rem" }}>
            <div>
              <strong>Latest Archive Checksum (SHA-256):</strong>{" "}
              <code style={{ color: "#38bdf8", wordBreak: "break-all" }}>
                {status.latestExport.checksumSha256}
              </code>
            </div>
            <div>
              <strong>Generated:</strong> {new Date(status.latestExport.createdAt).toLocaleString()} | <strong>Expires:</strong> {new Date(status.latestExport.expiresAt).toLocaleDateString()}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleExportData}
            disabled={exporting || loading}
            style={{
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "0.45rem 0.9rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: exporting ? "not-allowed" : "pointer",
            }}
          >
            {exporting ? "Generating Archive…" : "Export Data Archive (JSON)"}
          </button>

          {latestArchive && (
            <button
              type="button"
              onClick={() => handleDownloadJson(latestArchive.archive, latestArchive.checksumSha256)}
              style={{
                background: "#22c55e",
                color: "#000",
                border: "none",
                borderRadius: "4px",
                padding: "0.45rem 0.9rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ⬇ Download .json File
            </button>
          )}
        </div>
      </div>

      {/* Section 2: Right to Erasure / Account Deletion Danger Zone */}
      <div style={{ background: "#1e1014", border: "1px solid #7f1d1d", borderRadius: "6px", padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <div>
          <div style={{ fontWeight: 600, color: "#fca5a5", fontSize: "0.95rem" }}>
            ⚠️ Right to Erasure &amp; Account Scrub (Article 17 &amp; CCPA §1798.105)
          </div>
          <div style={{ fontSize: "0.8rem", color: "#f87171", marginTop: "0.25rem" }}>
            Permanently scrubs sensitive health/wellness logs, invalidates all sessions, and replaces personal identity with an anonymized tombstone. Official FIBA match scorebooks retain [Former Member] per competitive integrity exemptions.
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowErasureModal(true)}
            style={{
              background: "#b91c1c",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "0.45rem 0.9rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Request Permanent Account Erasure
          </button>
        </div>
      </div>

      {/* Erasure Confirmation Modal */}
      {showErasureModal && (
        <form
          onSubmit={handleConfirmErasure}
          style={{
            background: "#090d16",
            border: "1px solid #dc2626",
            borderRadius: "6px",
            padding: "1.25rem",
            display: "grid",
            gap: "0.75rem",
          }}
        >
          <div style={{ fontWeight: 700, color: "#f87171", fontSize: "1rem" }}>
            Confirm Irreversible Account Erasure
          </div>
          <div style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
            To protect against unauthorized account deletion, please enter your password to confirm. This action cannot be reversed.
          </div>

          <label style={{ fontSize: "0.8rem", color: "#cbd5e1", display: "grid", gap: "0.25rem" }}>
            Current Password
            <input
              type="password"
              required
              placeholder="Enter your current password"
              value={passwordVerify}
              onChange={(e) => setPasswordVerify(e.target.value)}
              style={{
                background: "#1e293b",
                border: "1px solid #475569",
                borderRadius: "4px",
                padding: "0.4rem 0.6rem",
                color: "#fff",
                fontSize: "0.85rem",
              }}
            />
          </label>

          <label style={{ fontSize: "0.8rem", color: "#cbd5e1", display: "grid", gap: "0.25rem" }}>
            Reason for leaving (optional)
            <input
              type="text"
              placeholder="e.g. Relocating, no longer playing competitive basketball..."
              maxLength={200}
              value={erasureReason}
              onChange={(e) => setErasureReason(e.target.value)}
              style={{
                background: "#1e293b",
                border: "1px solid #475569",
                borderRadius: "4px",
                padding: "0.4rem 0.6rem",
                color: "#fff",
                fontSize: "0.85rem",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              type="submit"
              disabled={erasing || !passwordVerify}
              style={{
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "0.45rem 1rem",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: erasing ? "not-allowed" : "pointer",
              }}
            >
              {erasing ? "Scrubbing Data…" : "Permanently Erase My Account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowErasureModal(false);
                setPasswordVerify("");
                setErasureReason("");
              }}
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "1px solid #475569",
                borderRadius: "4px",
                padding: "0.45rem 0.8rem",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
