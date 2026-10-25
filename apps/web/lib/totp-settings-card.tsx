"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { api, ApiError } from "./api";

export interface TotpStatusResponse {
  enabled: boolean;
  verifiedAt: string | null;
}

export interface TotpSetupResponse {
  secret: string;
  uri: string;
  recoveryCodes: string[];
}

export function TotpSettingsCard() {
  const [status, setStatus] = useState<TotpStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Setup Flow State
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState<string>("");
  const [copiedCodes, setCopiedCodes] = useState<boolean>(false);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);
  const [activating, setActivating] = useState<boolean>(false);

  // Disable Flow State
  const [showDisableModal, setShowDisableModal] = useState<boolean>(false);
  const [disablePassword, setDisablePassword] = useState<string>("");
  const [disableCode, setDisableCode] = useState<string>("");
  const [disabling, setDisabling] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api<TotpStatusResponse>("/auth/totp/status");
      setStatus(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not fetch 2FA security status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  async function handleStartSetup() {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const data = await api<TotpSetupResponse>("/auth/totp/setup", { method: "POST" });
      setSetupData(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to initiate TOTP setup");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmEnable(e: FormEvent) {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setActivating(true);
    setError(null);
    try {
      await api("/auth/totp/enable", {
        method: "POST",
        body: { code: verifyCode.trim() },
      });
      setSuccess("Two-Factor Authentication activated successfully!");
      setSetupData(null);
      setVerifyCode("");
      await fetchStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid verification code. Please check your authenticator.");
    } finally {
      setActivating(false);
    }
  }

  async function handleConfirmDisable(e: FormEvent) {
    e.preventDefault();
    setDisabling(true);
    setError(null);
    try {
      await api("/auth/totp/disable", {
        method: "POST",
        body: { password: disablePassword, code: disableCode.trim() },
      });
      setSuccess("Two-Factor Authentication disabled.");
      setShowDisableModal(false);
      setDisablePassword("");
      setDisableCode("");
      await fetchStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to disable 2FA.");
    } finally {
      setDisabling(false);
    }
  }

  function copyToClipboard(text: string, type: "secret" | "codes") {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      if (type === "secret") {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedCodes(true);
        setTimeout(() => setCopiedCodes(false), 2000);
      }
    }
  }

  if (loading && !status && !setupData) {
    return <div style={{ padding: "1rem", color: "#94a3b8" }}>Loading security settings…</div>;
  }

  return (
    <section
      role="region"
      aria-label="Two-Factor Authentication"
      style={{
        background: "#131b2e",
        border: "1px solid #232f48",
        borderRadius: "8px",
        padding: "1.25rem",
        display: "grid",
        gap: "1rem",
        maxWidth: "600px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.25rem 0", color: "#f8fafc" }}>
            Two-Factor Authentication (TOTP)
          </h2>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
            Add an extra layer of protection using standard authenticator apps (Google Authenticator, Apple Passwords, 1Password).
          </p>
        </div>

        <span
          style={{
            padding: "0.2rem 0.6rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 700,
            background: status?.enabled ? "rgba(34, 197, 94, 0.15)" : "rgba(249, 115, 22, 0.15)",
            color: status?.enabled ? "#4ade80" : "#fb923c",
            border: `1px solid ${status?.enabled ? "rgba(34, 197, 94, 0.3)" : "rgba(249, 115, 22, 0.3)"}`,
          }}
        >
          {status?.enabled ? "ACTIVE" : "DISABLED"}
        </span>
      </div>

      {error && (
        <div role="alert" style={{ background: "#450a0a", border: "1px solid #dc2626", color: "#fca5a5", padding: "0.6rem 0.8rem", borderRadius: "4px", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{ background: "#052e16", border: "1px solid #16a34a", color: "#86efac", padding: "0.6rem 0.8rem", borderRadius: "4px", fontSize: "0.85rem" }}>
          {success}
        </div>
      )}

      {/* Main Status Actions */}
      {!setupData && !showDisableModal && (
        <div>
          {status?.enabled ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
                ✓ Two-factor authentication is protecting your account. You will be prompted for an authenticator code during login.
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowDisableModal(true)}
                  style={{
                    background: "#334155",
                    color: "#f8fafc",
                    border: "none",
                    borderRadius: "4px",
                    padding: "0.4rem 0.8rem",
                    fontSize: "0.825rem",
                    cursor: "pointer",
                  }}
                >
                  Disable Two-Factor Authentication
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => void handleStartSetup()}
                style={{
                  background: "#f97316",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Set Up Two-Factor Authentication
              </button>
            </div>
          )}
        </div>
      )}

      {/* Setup Modal / Step-by-Step Card */}
      {setupData && (
        <form onSubmit={handleConfirmEnable} style={{ display: "grid", gap: "1rem", borderTop: "1px solid #232f48", paddingTop: "1rem" }}>
          <h3 style={{ fontSize: "0.95rem", margin: 0, color: "#f8fafc" }}>
            Step 1: Scan or Enter Secret Key
          </h3>

          <div style={{ background: "#0b0f19", padding: "0.75rem", borderRadius: "4px", display: "grid", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Manual Entry Key (Base32):</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <code style={{ fontFamily: "monospace", fontSize: "1rem", color: "#38bdf8", letterSpacing: "1px" }}>
                {setupData.secret}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(setupData.secret, "secret")}
                style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", borderRadius: "4px", padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer" }}
              >
                {copiedSecret ? "Copied!" : "Copy Key"}
              </button>
            </div>
            <div style={{ marginTop: "0.25rem" }}>
              <a href={setupData.uri} style={{ fontSize: "0.8rem", color: "#38bdf8" }}>
                Open directly in Authenticator app
              </a>
            </div>
          </div>

          <h3 style={{ fontSize: "0.95rem", margin: 0, color: "#f8fafc" }}>
            Step 2: Save Emergency Backup Recovery Codes
          </h3>
          <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: 0 }}>
            If you ever lose access to your device, each recovery code can be used once to access your account. Store these in a safe password manager.
          </p>

          <div style={{ background: "#0b0f19", padding: "0.75rem", borderRadius: "4px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", fontFamily: "monospace", fontSize: "0.85rem", color: "#e2e8f0" }}>
              {setupData.recoveryCodes.map((code) => (
                <div key={code}>{code}</div>
              ))}
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => copyToClipboard(setupData.recoveryCodes.join("\n"), "codes")}
                style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", borderRadius: "4px", padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer" }}
              >
                {copiedCodes ? "Codes Copied!" : "Copy All Codes"}
              </button>
            </div>
          </div>

          <h3 style={{ fontSize: "0.95rem", margin: 0, color: "#f8fafc" }}>
            Step 3: Enter 6-Digit Code to Confirm
          </h3>
          <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem", color: "#cbd5e1" }}>
            Verification Code
            <input
              type="text"
              name="verifyCode"
              placeholder="123456"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              required
              style={{
                background: "#0b0f19",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "0.5rem",
                color: "#f8fafc",
                fontSize: "1rem",
                width: "160px",
                letterSpacing: "2px",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="submit"
              disabled={activating || verifyCode.trim().length !== 6}
              style={{
                background: activating ? "#64748b" : "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                padding: "0.5rem 1rem",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: activating ? "not-allowed" : "pointer",
              }}
            >
              {activating ? "Verifying…" : "Confirm & Activate"}
            </button>
            <button
              type="button"
              onClick={() => { setSetupData(null); setVerifyCode(""); }}
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "0.5rem 0.8rem",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Disable 2FA Form */}
      {showDisableModal && (
        <form onSubmit={handleConfirmDisable} style={{ display: "grid", gap: "1rem", borderTop: "1px solid #232f48", paddingTop: "1rem" }}>
          <h3 style={{ fontSize: "0.95rem", margin: 0, color: "#f8fafc" }}>
            Confirm Disabling Two-Factor Authentication
          </h3>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
            For your security, enter your account password and a current 6-digit authenticator code (or recovery code).
          </p>

          <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem", color: "#cbd5e1" }}>
            Account Password
            <input
              type="password"
              name="disablePassword"
              required
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              style={{
                background: "#0b0f19",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "0.5rem",
                color: "#f8fafc",
                fontSize: "0.9rem",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem", color: "#cbd5e1" }}>
            Current Authenticator Code or Recovery Code
            <input
              type="text"
              name="disableCode"
              required
              placeholder="123456 or a1b2-c3d4"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              style={{
                background: "#0b0f19",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "0.5rem",
                color: "#f8fafc",
                fontSize: "0.9rem",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="submit"
              disabled={disabling}
              style={{
                background: disabling ? "#64748b" : "#dc2626",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                padding: "0.5rem 1rem",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: disabling ? "not-allowed" : "pointer",
              }}
            >
              {disabling ? "Disabling…" : "Confirm Disable"}
            </button>
            <button
              type="button"
              onClick={() => { setShowDisableModal(false); setDisablePassword(""); setDisableCode(""); }}
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "0.5rem 0.8rem",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
