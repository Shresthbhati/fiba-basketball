"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  LoadingState,
  Select,
} from "@courtiq/design-system";
import { api, ApiError, type Me } from "./api";

export interface CommunityItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  city: string;
  primaryCourtId: string | null;
  isPrivate: boolean;
  creatorId: string;
  memberCount: number;
  skillLevel: "CASUAL" | "INTERMEDIATE" | "COMPETITIVE" | "OPEN";
  createdAt: string;
  role?: "LEADER" | "CO_HOST" | "MEMBER" | null;
}

export interface CommunityMember {
  id: string;
  userId: string;
  role: "LEADER" | "CO_HOST" | "MEMBER";
  status: "ACTIVE" | "PENDING";
  joinedAt: string;
  displayName?: string;
  email?: string;
}

export interface CommunityPickupGame {
  id: string;
  title: string;
  courtId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  skillBand?: string | null;
  confirmedCount: number;
  spotsLeft: number;
  phase: string;
}

export function CommunitiesView() {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCity, setFilterCity] = useState("ALL");
  const [filterSkill, setFilterSkill] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);

  // Form states for creation
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newSkill, setNewSkill] = useState<"CASUAL" | "INTERMEDIATE" | "COMPETITIVE" | "OPEN">("OPEN");
  const [isPrivate, setIsPrivate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Current user
  const { data: me } = useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me").catch(() => null),
  });

  // Query communities
  const { data: communitiesData, isLoading } = useQuery<{ items: CommunityItem[] }>({
    queryKey: ["communities"],
    queryFn: () => api<{ items: CommunityItem[] }>("/communities"),
  });

  const communities = communitiesData?.items ?? [];

  // Distinct cities
  const cities = useMemo(() => {
    const set = new Set<string>();
    communities.forEach((c) => {
      if (c.city) set.add(c.city);
    });
    return Array.from(set).sort();
  }, [communities]);

  // Filtered communities
  const filtered = useMemo(() => {
    return communities.filter((c) => {
      if (filterCity !== "ALL" && c.city !== filterCity) return false;
      if (filterSkill !== "ALL" && c.skillLevel !== filterSkill) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [communities, filterCity, filterSkill, searchTerm]);

  // Detail query
  const { data: detailData, isLoading: isDetailLoading, error: detailError } = useQuery<{
    community: CommunityItem;
    members: CommunityMember[];
    games: CommunityPickupGame[];
  }>({
    queryKey: ["community-detail", selectedCommunityId],
    queryFn: async () => {
      if (!selectedCommunityId) throw new Error("No community selected");
      const [commRes, membersRes, gamesRes] = await Promise.all([
        api<CommunityItem>(`/communities/${selectedCommunityId}`),
        api<{ items: CommunityMember[] }>(`/communities/${selectedCommunityId}/members`),
        api<{ items: CommunityPickupGame[] }>(`/communities/${selectedCommunityId}/games`),
      ]);
      return {
        community: commRes,
        members: membersRes.items,
        games: gamesRes.items,
      };
    },
    enabled: !!selectedCommunityId,
  });

  // Join mutation
  const joinMutation = useMutation({
    mutationFn: (id: string) => api(`/communities/${id}/join`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communities"] });
      qc.invalidateQueries({ queryKey: ["community-detail", selectedCommunityId] });
    },
  });

  // Leave mutation
  const leaveMutation = useMutation({
    mutationFn: (id: string) => api(`/communities/${id}/leave`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communities"] });
      qc.invalidateQueries({ queryKey: ["community-detail", selectedCommunityId] });
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      return api<CommunityItem>("/communities", {
        method: "POST",
        body: {
          name: newName.trim(),
          slug: newSlug.trim() || newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          description: newDescription.trim(),
          city: newCity.trim(),
          skillLevel: newSkill,
          isPrivate,
        },
      });
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["communities"] });
      setIsCreateOpen(false);
      setNewName("");
      setNewSlug("");
      setNewDescription("");
      setNewCity("");
      setSelectedCommunityId(created.id);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else {
        setCreateError("Could not create squad hub.");
      }
    },
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Basketball Communities & Squad Hubs</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
            Connect with local regular runs, recurring squads, and city basketball clubs.
          </p>
        </div>
        {me && (
          <Button variant="primary" onClick={() => { setCreateError(null); setIsCreateOpen(true); }}>
            + Create Squad Hub
          </Button>
        )}
      </div>

      {/* Filter Controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          background: "var(--surface)",
          padding: 12,
          borderRadius: 8,
          alignItems: "center",
        }}
      >
        <div style={{ flex: "1 1 200px" }}>
          <Input
            label="Search Squads or Cities"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, neighborhood, or city..."
          />
        </div>

        <div style={{ minWidth: 160 }}>
          <Select
            label="Filter City"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            options={[{ value: "ALL", label: "All Cities" }, ...cities.map((c) => ({ value: c, label: c }))]}
          />
        </div>

        <div style={{ minWidth: 160 }}>
          <Select
            label="Skill Preference"
            value={filterSkill}
            onChange={(e) => setFilterSkill(e.target.value)}
            options={[
              { value: "ALL", label: "All Skill Levels" },
              { value: "OPEN", label: "Open / All Welcome" },
              { value: "CASUAL", label: "Casual / Rec" },
              { value: "INTERMEDIATE", label: "Intermediate" },
              { value: "COMPETITIVE", label: "Competitive Run" },
            ]}
          />
        </div>
      </div>

      {/* Communities Grid */}
      {isLoading ? (
        <LoadingState message="Loading basketball communities..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No basketball squads found"
          description={
            searchTerm || filterCity !== "ALL" || filterSkill !== "ALL"
              ? "Try broadening your search filters or check another city."
              : "No basketball squads formed in this area yet. Be the first to start a squad hub!"
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((comm) => (
            <Card
              key={comm.id}
              title={comm.name}
              badge={
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge variant={comm.isPrivate ? "neutral" : "brand"}>
                    {comm.isPrivate ? "🔒 Private" : "🌐 Public"}
                  </Badge>
                  <Badge variant="info">{comm.skillLevel}</Badge>
                </div>
              }
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedCommunityId(comm.id)}
                >
                  View Squad
                </Button>
              }
            >
              <div style={{ display: "grid", gap: 8, fontSize: "0.88rem" }}>
                <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.4 }}>
                  {comm.description || "Active community basketball squad."}
                </p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--muted)", fontSize: "0.82rem", marginTop: 4 }}>
                  <span>📍 {comm.city || "Everywhere"}</span>
                  <span>👥 {comm.memberCount} ballers</span>
                </div>

                {me && (
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => joinMutation.mutate(comm.id)}
                      disabled={joinMutation.isPending}
                    >
                      Join Squad
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Community Detail Dialog */}
      <Dialog
        open={!!selectedCommunityId}
        onClose={() => setSelectedCommunityId(null)}
        title={detailData?.community.name ?? "Squad Details"}
        description={detailData?.community.city ? `Active in ${detailData.community.city}` : "Basketball squad"}
      >
        {isDetailLoading ? (
          <LoadingState message="Loading squad details..." />
        ) : detailError ? (
          <div style={{ color: "#f87171", padding: 12 }}>
            {detailError instanceof ApiError && detailError.status === 404
              ? "This squad is private. Only approved squad members can view runs and rosters."
              : "Could not load squad details."}
          </div>
        ) : detailData ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Badge variant={detailData.community.isPrivate ? "neutral" : "brand"}>
                  {detailData.community.isPrivate ? "🔒 Private Squad" : "🌐 Public Squad"}
                </Badge>
                <Badge variant="info">{detailData.community.skillLevel}</Badge>
                <Badge variant="success">{detailData.community.memberCount} Members</Badge>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>{detailData.community.description}</p>
            </div>

            {/* Upcoming Pickup Runs */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Squad Pickup Games</h3>
                <Link
                  href={`/pickup/new?communityId=${detailData.community.id}`}
                  style={{
                    fontSize: "0.8rem",
                    color: "#f97316",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  + Host Run for Squad
                </Link>
              </div>

              {detailData.games.length === 0 ? (
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", padding: "6px 0" }}>
                  No scheduled runs right now. Host a game for squad members!
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {detailData.games.map((game) => (
                    <div
                      key={game.id}
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong>{game.title}</strong>
                        <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                          {new Date(game.startsAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {game.confirmedCount}/{game.capacity} spots
                        </div>
                      </div>
                      <Link
                        href={`/pickup/${game.id}`}
                        style={{
                          background: "#f97316",
                          color: "#000",
                          padding: "4px 10px",
                          borderRadius: 4,
                          textDecoration: "none",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                        }}
                      >
                        View Run
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Squad Members */}
            <div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "1rem" }}>Roster</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {detailData.members.map((m) => (
                  <span
                    key={m.id}
                    style={{
                      background: "rgba(255, 255, 255, 0.06)",
                      padding: "4px 10px",
                      borderRadius: 14,
                      fontSize: "0.8rem",
                    }}
                  >
                    {m.displayName ?? m.userId.slice(0, 8)}
                    {m.role === "LEADER" && " 👑"}
                    {m.role === "CO_HOST" && " 🛡️"}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              {me && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => leaveMutation.mutate(detailData.community.id)}
                  disabled={leaveMutation.isPending}
                >
                  Leave Squad
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setSelectedCommunityId(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      {/* Create Community Dialog */}
      <Dialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create a Basketball Squad Hub"
        description="Build a permanent community group for regular runs, court crews, or tournament squads."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCreateError(null);
            createMutation.mutate();
          }}
          style={{ display: "grid", gap: 14 }}
        >
          {createError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                borderRadius: 6,
                fontSize: "0.85rem",
              }}
            >
              {createError}
            </div>
          )}

          <Input
            label="Squad Name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (!newSlug) {
                setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
              }
            }}
            placeholder="e.g. Brooklyn Sunset Park Ballers"
            required
            maxLength={100}
          />

          <Input
            label="URL Slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="sunset-park-ballers"
            required
            maxLength={50}
          />

          <Input
            label="City / Neighborhood"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            placeholder="e.g. Brooklyn, NY"
            required
            maxLength={100}
          />

          <Select
            label="Skill Level"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value as "CASUAL" | "INTERMEDIATE" | "COMPETITIVE" | "OPEN")}
            options={[
              { value: "OPEN", label: "Open / All Welcome" },
              { value: "CASUAL", label: "Casual / Rec" },
              { value: "INTERMEDIATE", label: "Intermediate" },
              { value: "COMPETITIVE", label: "Competitive Run" },
            ]}
          />

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
              Description & Squad Rules
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Weekly Sunday morning runs, call your own fouls, winners stay on..."
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <span>Private Squad (Only invited or approved members can view runs)</span>
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={createMutation.isPending}>
              Create Squad
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
