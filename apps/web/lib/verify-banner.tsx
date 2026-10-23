"use client";
import { useState } from "react";
import { ApiError, NetworkError, api } from "./api";

export function VerifyBanner() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState("busy");
    setError(null);
    try {
      await api("/auth/email/send-verification", { method: "POST" });
      setState("sent");
    } catch (err) {
      setState("idle");
      if (err instanceof ApiError && err.status === 429) setError("Too many requests. Please wait a minute before trying again.");
      else setError(err instanceof NetworkError ? "Could not reach the server. Check your connection." : "Could not send the email. Please try again.");
    }
  }

  return (
    <div aria-label="Email verification" style={{ background: "var(--surface)", borderBottom: "1px solid #2a323c", padding: "8px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span>Please verify your email address.</span>
      {state === "sent" ? (
        <span role="status">Verification email sent. Check your inbox.</span>
      ) : (
        <button className="secondary" style={{ minHeight: 36, padding: "4px 12px" }} disabled={state === "busy"} onClick={resend}>
          {state === "busy" ? "Sending…" : "Resend verification email"}
        </button>
      )}
      {error && <span role="alert" style={{ color: "#ff6b6b" }}>{error}</span>}
    </div>
  );
}
