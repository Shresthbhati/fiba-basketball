"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

interface GrantItem {
  id: string;
  token: string;
  label?: string | null;
  includeAverages: boolean;
  includeShootingSplits: boolean;
  includeMinutes: boolean;
  includeGameLog: boolean;
  includeBiometrics: boolean;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export function PassportShareManager() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [includeAverages, setIncludeAverages] = useState(true);
  const [includeShootingSplits, setIncludeShootingSplits] = useState(true);
  const [includeMinutes, setIncludeMinutes] = useState(false);
  const [includeGameLog, setIncludeGameLog] = useState(true);
  const [includeBiometrics, setIncludeBiometrics] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number>(14);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["my-passport-grants"],
    queryFn: () => api<{ items: GrantItem[] }>("/me/passport/grants"),
    enabled: isOpen,
  });

  const grants = data?.items ?? [];
  const activeGrants = grants.filter((g) => !g.revokedAt);

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<GrantItem>("/me/passport/grants", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["my-passport-grants"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/me/passport/grants/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-passport-grants"] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      label: label.trim() || undefined,
      includeAverages,
      includeShootingSplits,
      includeMinutes,
      includeGameLog,
      includeBiometrics,
      expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
    });
  };

  const copyLink = (token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(`${origin}/passport/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  };

  return (
    <div style={{ marginTop: 24, padding: 18, borderRadius: 10, backgroundColor: "#14151b", border: "1px solid #1f2937" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: "1.1rem", fontWeight: 700 }}>Share Your Career Passport</h3>
          <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.85rem" }}>
            Generate privacy-controlled links for scouts or coaches. You control which stats are revealed.
          </p>
        </div>
        <button
          type="button"
          className={isOpen ? "secondary" : "primary"}
          onClick={() => setIsOpen(!isOpen)}
          style={{ fontSize: "0.85rem", padding: "6px 14px" }}
        >
          {isOpen ? "Hide Share Controls" : "Manage Share Links"}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Create New Link Form */}
          <form
            onSubmit={handleCreate}
            style={{
              padding: 16,
              borderRadius: 8,
              backgroundColor: "#0d0e12",
              border: "1px solid #2d3748",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>Create New Passport Link</h4>

            <div>
              <label htmlFor="grant-label" style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 4 }}>
                Recipient / Label (optional)
              </label>
              <input
                id="grant-label"
                type="text"
                placeholder="e.g. Coach Davis - State University"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 4 }}
              />
            </div>

            {/* Field-level privacy checkboxes */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              <label style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={includeAverages}
                  onChange={(e) => setIncludeAverages(e.target.checked)}
                />
                Per-Game Averages
              </label>

              <label style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={includeShootingSplits}
                  onChange={(e) => setIncludeShootingSplits(e.target.checked)}
                />
                Shooting Splits (FG/3P/FT)
              </label>

              <label style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={includeMinutes}
                  onChange={(e) => setIncludeMinutes(e.target.checked)}
                />
                Minutes Played
              </label>

              <label style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={includeGameLog}
                  onChange={(e) => setIncludeGameLog(e.target.checked)}
                />
                Game-by-Game Log
              </label>

              <label style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={includeBiometrics}
                  onChange={(e) => setIncludeBiometrics(e.target.checked)}
                />
                Verified Biometrics (Jump)
              </label>
            </div>

            {/* Expiry selection */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>Expires in:</span>
              {[7, 14, 30, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={expiresInDays === d ? "primary" : "secondary"}
                  style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                  onClick={() => setExpiresInDays(d)}
                >
                  {d === 0 ? "No expiry" : `${d} days`}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="primary"
              disabled={createMutation.isPending}
              style={{ alignSelf: "flex-start", marginTop: 4, padding: "6px 14px", fontSize: "0.85rem" }}
            >
              {createMutation.isPending ? "Creating..." : "Generate Share Link"}
            </button>
          </form>

          {/* Active Links List */}
          {activeGrants.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>Active Share Links ({activeGrants.length})</h4>
              {activeGrants.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderRadius: 6,
                    backgroundColor: "#0d0e12",
                    border: "1px solid #1f2937",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{g.label || "Untitled Link"}</div>
                    <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                      Created: {new Date(g.createdAt).toLocaleDateString()}
                      {g.expiresAt ? ` · Expires: ${new Date(g.expiresAt).toLocaleDateString()}` : " · No expiry"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => copyLink(g.token)}
                      style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                    >
                      {copiedToken === g.token ? "Copied!" : "Copy URL"}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => revokeMutation.mutate(g.id)}
                      disabled={revokeMutation.isPending}
                      style={{ padding: "4px 10px", fontSize: "0.78rem", color: "#f87171" }}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
