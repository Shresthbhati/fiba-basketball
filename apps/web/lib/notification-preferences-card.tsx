"use client";

import React, { useState, useEffect, useCallback, type FormEvent } from "react";
import { api, ApiError } from "./api";

export interface NotificationPreferences {
  userId: string;
  webPushEnabled: boolean;
  emailEnabled: boolean;
  gameInvites: boolean;
  courtAlerts: boolean;
  teamAnnouncements: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimezone: string;
  dailyCap: number;
  deliveredPast24h: number;
  inQuietHours: boolean;
  isCapped: boolean;
}

export interface TestDispatchResponse {
  delivered: boolean;
  suppressionReason: "QUIET_HOURS" | "DAILY_CAP_EXCEEDED" | "OPTED_OUT" | null;
  channel: string;
  kind: string;
  timestamp: string;
}

export function NotificationPreferencesCard() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestDispatchResponse | null>(null);

  // Form local state
  const [webPushEnabled, setWebPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [gameInvites, setGameInvites] = useState(true);
  const [courtAlerts, setCourtAlerts] = useState(true);
  const [teamAnnouncements, setTeamAnnouncements] = useState(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  const [quietHoursTimezone, setQuietHoursTimezone] = useState("UTC");
  const [dailyCap, setDailyCap] = useState(10);

  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<NotificationPreferences>("/notifications/preferences");
      setPrefs(data);
      setWebPushEnabled(data.webPushEnabled);
      setEmailEnabled(data.emailEnabled);
      setGameInvites(data.gameInvites);
      setCourtAlerts(data.courtAlerts);
      setTeamAnnouncements(data.teamAnnouncements);
      setQuietHoursEnabled(data.quietHoursEnabled);
      setQuietHoursStart(data.quietHoursStart);
      setQuietHoursEnd(data.quietHoursEnd);
      setQuietHoursTimezone(data.quietHoursTimezone);
      setDailyCap(data.dailyCap);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load notification preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api<NotificationPreferences>("/notifications/preferences", {
        method: "PUT",
        body: {
          webPushEnabled,
          emailEnabled,
          gameInvites,
          courtAlerts,
          teamAnnouncements,
          quietHoursEnabled,
          quietHoursStart,
          quietHoursEnd,
          quietHoursTimezone,
          dailyCap: Number(dailyCap),
        },
      });
      setPrefs(updated);
      setSuccess("Notification preferences saved successfully!");
      await loadPreferences();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update notification preferences");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestDispatch() {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await api<TestDispatchResponse>("/notifications/test-dispatch", {
        method: "POST",
        body: { kind: "GAME_INVITE", channel: "PUSH" },
      });
      setTestResult(res);
      await loadPreferences();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Test dispatch failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.75)",
        border: "1px solid #1e293b",
        borderRadius: "8px",
        padding: "1.25rem",
        display: "grid",
        gap: "1.25rem",
        maxWidth: 560,
      }}
    >
      <div>
        <h3
          style={{
            margin: "0 0 0.5rem 0",
            color: "#f8fafc",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>🔔 Notification Delivery &amp; Quiet Hours</span>
          <span
            style={{
              fontSize: "0.75rem",
              background: "#334155",
              color: "#cbd5e1",
              padding: "0.15rem 0.5rem",
              borderRadius: "4px",
              fontWeight: 600,
            }}
          >
            WP-5.1
          </span>
        </h3>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
          Configure Web Push notifications, quiet hours suppression windows, and daily anti-spam
          delivery limits.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "#450a0a",
            border: "1px solid #dc2626",
            color: "#fca5a5",
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          style={{
            background: "#052e16",
            border: "1px solid #16a34a",
            color: "#86efac",
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            fontSize: "0.85rem",
          }}
        >
          {success}
        </div>
      )}

      {/* Live Status Gauges */}
      {prefs && (
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
            fontSize: "0.8rem",
          }}
        >
          <div>
            <div style={{ color: "#94a3b8" }}>24-Hour Delivery Volume</div>
            <div style={{ fontWeight: 700, color: prefs.isCapped ? "#f87171" : "#38bdf8" }}>
              {prefs.deliveredPast24h} / {prefs.dailyCap} sent
              {prefs.isCapped ? " (Cap Reached)" : ""}
            </div>
          </div>

          <div>
            <div style={{ color: "#94a3b8" }}>Current Delivery State</div>
            {prefs.inQuietHours ? (
              <span
                style={{
                  background: "#451a03",
                  color: "#fcd34d",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                🌙 Quiet Hours Active
              </span>
            ) : (
              <span
                style={{
                  background: "#052e16",
                  color: "#86efac",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                ☀️ Normal Delivery Active
              </span>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "grid", gap: "1rem" }}>
        {/* Channel Preferences */}
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <div style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "0.85rem" }}>
            Delivery Channels
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#f8fafc" }}>
            <input
              type="checkbox"
              checked={webPushEnabled}
              onChange={(e) => setWebPushEnabled(e.target.checked)}
            />
            Web Push Notifications (Browser VAPID)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#f8fafc" }}>
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
            />
            Email Digest Notifications
          </label>
        </div>

        {/* Category Opt-ins */}
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <div style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "0.85rem" }}>
            Subscribed Alert Types
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#f8fafc" }}>
            <input
              type="checkbox"
              checked={gameInvites}
              onChange={(e) => setGameInvites(e.target.checked)}
            />
            Pickup Runs &amp; Match Game Invites
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#f8fafc" }}>
            <input
              type="checkbox"
              checked={courtAlerts}
              onChange={(e) => setCourtAlerts(e.target.checked)}
            />
            Nearby Court Condition &amp; Activity Alerts
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#f8fafc" }}>
            <input
              type="checkbox"
              checked={teamAnnouncements}
              onChange={(e) => setTeamAnnouncements(e.target.checked)}
            />
            Team Roster &amp; Competition Announcements
          </label>
        </div>

        {/* Quiet Hours Configuration */}
        <div
          style={{
            background: "#0b0f19",
            border: "1px solid #1e293b",
            borderRadius: "6px",
            padding: "0.75rem",
            display: "grid",
            gap: "0.6rem",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#f8fafc", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={quietHoursEnabled}
              onChange={(e) => setQuietHoursEnabled(e.target.checked)}
            />
            Enable Overnight Quiet Hours
          </label>

          {quietHoursEnabled && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.75rem", color: "#94a3b8", display: "grid", gap: "0.2rem" }}>
                Start Silence
                <input
                  type="text"
                  pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                  required
                  placeholder="22:00"
                  value={quietHoursStart}
                  onChange={(e) => setQuietHoursStart(e.target.value)}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "4px",
                    padding: "0.35rem 0.5rem",
                    color: "#fff",
                    fontSize: "0.8rem",
                  }}
                />
              </label>

              <label style={{ fontSize: "0.75rem", color: "#94a3b8", display: "grid", gap: "0.2rem" }}>
                End Silence
                <input
                  type="text"
                  pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                  required
                  placeholder="08:00"
                  value={quietHoursEnd}
                  onChange={(e) => setQuietHoursEnd(e.target.value)}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "4px",
                    padding: "0.35rem 0.5rem",
                    color: "#fff",
                    fontSize: "0.8rem",
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Daily Rate Cap */}
        <label style={{ fontSize: "0.85rem", color: "#cbd5e1", display: "grid", gap: "0.3rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Maximum Notifications per 24 Hours</span>
            <span style={{ fontWeight: 700, color: "#38bdf8" }}>{dailyCap} / day</span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={dailyCap}
            onChange={(e) => setDailyCap(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#0284c7" }}
          />
        </label>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
          <button
            type="submit"
            disabled={saving || loading}
            style={{
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "0.45rem 1rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save Preferences"}
          </button>

          <button
            type="button"
            onClick={handleTestDispatch}
            disabled={testing || loading}
            style={{
              background: "transparent",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: "4px",
              padding: "0.45rem 0.8rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: testing ? "not-allowed" : "pointer",
            }}
          >
            {testing ? "Testing…" : "Send Test Notification"}
          </button>
        </div>
      </form>

      {/* Test Dispatch Result */}
      {testResult && (
        <div
          role="region"
          aria-label="Test Notification Result"
          style={{
            background: testResult.delivered ? "#052e16" : "#451a03",
            border: testResult.delivered ? "1px solid #16a34a" : "1px solid #d97706",
            borderRadius: "6px",
            padding: "0.6rem 0.8rem",
            fontSize: "0.8rem",
            color: testResult.delivered ? "#86efac" : "#fde68a",
            display: "grid",
            gap: "0.25rem",
          }}
        >
          <div style={{ fontWeight: 700 }}>
            {testResult.delivered
              ? "✅ Test Notification Delivered Successfully"
              : `⏸️ Test Notification Suppressed (${testResult.suppressionReason})`}
          </div>
          <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>
            {testResult.delivered
              ? "Push signal passed all rate caps and quiet hours checks."
              : testResult.suppressionReason === "QUIET_HOURS"
              ? "Delivery suppressed because current time is within your overnight quiet hours window."
              : testResult.suppressionReason === "DAILY_CAP_EXCEEDED"
              ? "Delivery suppressed because you have reached your 24-hour notification limit."
              : "Delivery suppressed because this alert category is disabled."}
          </div>
        </div>
      )}
    </div>
  );
}
