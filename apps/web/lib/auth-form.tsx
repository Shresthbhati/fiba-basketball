"use client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "./api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [totpChallengeToken, setTotpChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ requiresTotp?: boolean; challengeToken?: string }>(`/auth/${mode}`, {
        method: "POST",
        body: mode === "login"
          ? { email: f.get("email"), password: f.get("password") }
          : { email: f.get("email"), password: f.get("password"), displayName: f.get("displayName"), dateOfBirth: f.get("dateOfBirth") },
      });

      if (res?.requiresTotp && res?.challengeToken) {
        setTotpChallengeToken(res.challengeToken);
        return;
      }

      await qc.invalidateQueries({ queryKey: ["me"] });
      router.push("/pickup");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onTotpSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/totp/challenge", {
        method: "POST",
        body: { challengeToken: totpChallengeToken, code: totpCode.trim() },
      });
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.push("/pickup");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Authentication code invalid. Check your authenticator app.");
    } finally {
      setBusy(false);
    }
  }

  if (totpChallengeToken) {
    return (
      <form onSubmit={onTotpSubmit} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <h1>Two-Factor Authentication</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>
          Enter the 6-digit code from your authenticator app or an 8-character backup recovery code.
        </p>
        <label>
          Authentication code
          <input
            name="totpCode"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            required
            autoFocus
            autoComplete="one-time-code"
            placeholder="123456 or a1b2-c3d4"
          />
        </label>
        {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify & Sign in"}</button>
        <button
          type="button"
          onClick={() => {
            setTotpChallengeToken(null);
            setTotpCode("");
            setError(null);
          }}
          style={{ background: "transparent", border: "none", color: "#38bdf8", cursor: "pointer", fontSize: "0.85rem" }}
        >
          ← Back to password login
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
      <h1>{mode === "login" ? "Log in" : "Create account"}</h1>
      {mode === "signup" && (
        <>
          <label>Display name<input name="displayName" required maxLength={60} /></label>
          <label>Date of birth<input name="dateOfBirth" type="date" required /></label>
        </>
      )}
      <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Password<input name="password" type="password" required minLength={mode === "signup" ? 10 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
      {mode === "signup" && <small>At least 10 characters. You must be 13 or older.</small>}
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}</button>
    </form>
  );
}
