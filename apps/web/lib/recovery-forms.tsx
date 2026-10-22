"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, NetworkError, api } from "./api";

const errStyle = { color: "#ff6b6b" } as const;
const OFFLINE = "Could not reach the server. Check your connection and try again.";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password-reset/request", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError("Too many requests. Wait a minute and try again.");
      else setError(err instanceof NetworkError ? OFFLINE : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <h1>Check your email</h1>
        <p role="status">If an account exists for that email, we&apos;ve sent a link</p>
        <p><Link href="/login">Back to log in</Link></p>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
      <h1>Forgot password?</h1>
      <p>Enter your email and we&apos;ll send a link to choose a new password.</p>
      <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      {error && <p role="alert" style={errStyle}>{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Please wait…" : "Send reset link"}</button>
      <p><Link href="/login">Back to log in</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  if (!token) return <InvalidLink what="reset" />;
  if (invalid) return <InvalidLink what="reset" />;
  if (done) {
    return (
      <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <h1>Password updated</h1>
        <p role="status">Your password has been changed. Any other devices have been signed out.</p>
        <p><Link href="/login">Log in with your new password</Link></p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password.length < 10) return setError("Password must be at least 10 characters.");
    if (password !== String(f.get("confirm") ?? "")) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password-reset/confirm", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setInvalid(true);
      else if (err instanceof ApiError && err.status === 429) setError("Too many attempts. Wait a minute and try again.");
      else setError(err instanceof NetworkError ? OFFLINE : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
      <h1>Choose a new password</h1>
      <label>New password<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
      <label>Confirm new password<input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></label>
      <small>At least 10 characters.</small>
      {error && <p role="alert" style={errStyle}>{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Please wait…" : "Set new password"}</button>
    </form>
  );
}

function InvalidLink({ what }: { what: "reset" | "verification" }) {
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
      <h1>Link not valid</h1>
      <p role="alert" style={errStyle}>This link is invalid or has expired.</p>
      {what === "reset"
        ? <p><Link href="/forgot-password">Request a new reset link</Link></p>
        : <p>Log in and use &ldquo;Resend verification email&rdquo; to get a new link. <Link href="/login">Log in</Link></p>}
    </div>
  );
}

export function VerifyEmail({ token }: { token: string | null }) {
  const [state, setState] = useState<"loading" | "ok" | "invalid" | "error">(token ? "loading" : "invalid");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return; // React strict mode runs effects twice; the token is single-use
    started.current = true;
    api("/auth/email/verify", { method: "POST", body: { token } })
      .then(() => setState("ok"))
      .catch((err) => setState(err instanceof ApiError && err.status === 400 ? "invalid" : "error"));
  }, [token]);

  if (state === "loading") return <p role="status">Verifying your email…</p>;
  if (state === "invalid") return <InvalidLink what="verification" />;
  if (state === "error") {
    return (
      <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <h1>Could not verify</h1>
        <p role="alert" style={errStyle}>We couldn&apos;t reach the server. Reload this page to try again.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
      <h1>Email verified</h1>
      <p role="status">Thanks, your email address is confirmed.</p>
      <p><Link href="/pickup">Continue to COURT IQ</Link></p>
    </div>
  );
}
