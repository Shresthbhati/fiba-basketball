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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, {
        method: "POST",
        body: mode === "login"
          ? { email: f.get("email"), password: f.get("password") }
          : { email: f.get("email"), password: f.get("password"), displayName: f.get("displayName"), dateOfBirth: f.get("dateOfBirth") },
      });
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.push("/pickup");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
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
