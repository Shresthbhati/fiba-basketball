"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FilmSearch, type SearchResultClip, type SavedSearch } from "../../../lib/film-search";
import { api } from "../../../lib/api";

const SAMPLE_CLIPS: SearchResultClip[] = [
  {
    id: "clip-01",
    gameId: "game-demo-1",
    gameTitle: "Semifinals vs Northern Lions",
    opponent: "Northern Lions",
    playedOn: "2026-10-18",
    startMs: 142000,
    endMs: 161000,
    durationMs: 19000,
    tags: ["spain-pnr", "clutch", "half-court"],
    note: "Center drops 2.5m deep; weakside back-screen frees shooter on the wing for open 3PT.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "clip-02",
    gameId: "game-demo-1",
    gameTitle: "Semifinals vs Northern Lions",
    opponent: "Northern Lions",
    playedOn: "2026-10-18",
    startMs: 245000,
    endMs: 258000,
    durationMs: 13000,
    tags: ["transition", "fastbreak"],
    note: "Defensive rebound into pitch-ahead pass for transition layup within 5 seconds.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "clip-03",
    gameId: "game-demo-2",
    gameTitle: "Regular Season vs City Hawks",
    opponent: "City Hawks",
    playedOn: "2026-10-12",
    startMs: 82000,
    endMs: 104000,
    durationMs: 22000,
    tags: ["horns", "3-pointer"],
    note: "Horns Pop action against aggressive 2-3 zone trap at high wing.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "clip-04",
    gameId: "game-demo-2",
    gameTitle: "Regular Season vs City Hawks",
    opponent: "City Hawks",
    playedOn: "2026-10-12",
    startMs: 310000,
    endMs: 324000,
    durationMs: 14000,
    tags: ["closeout", "defense"],
    note: "Weakside stunt-and-recover forces shot clock violation on corner drive.",
    createdAt: new Date().toISOString(),
  },
];

const SAMPLE_SAVED_SEARCHES: SavedSearch[] = [
  {
    id: "search-01",
    teamId: "team-demo",
    userId: "user-coach",
    name: "Spain PnR Breakdown",
    filters: { tag: "spain-pnr" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "search-02",
    teamId: "team-demo",
    userId: "user-coach",
    name: "Transition Sequences",
    filters: { tag: "transition" },
    createdAt: new Date().toISOString(),
  },
];

export default function FilmSearchPage() {
  const qc = useQueryClient();
  const [createdMontageId, setCreatedMontageId] = useState<string | null>(null);

  // Fetch current user's teams
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<{ items: Array<{ id: string; name: string }> }>("/teams").catch(() => ({ items: [] })),
  });

  const teamId = teamsQuery.data?.items?.[0]?.id ?? "team-demo";

  // Fetch search clips from backend
  const clipsQuery = useQuery({
    queryKey: ["filmSearch", teamId],
    queryFn: () => api<{ items: SearchResultClip[] }>(`/teams/${teamId}/film/search`),
    enabled: teamId !== "team-demo",
  });

  // Fetch saved searches
  const savedSearchesQuery = useQuery({
    queryKey: ["filmSavedSearches", teamId],
    queryFn: () => api<{ items: SavedSearch[] }>(`/teams/${teamId}/film/saved-searches`),
    enabled: teamId !== "team-demo",
  });

  const clips = clipsQuery.data?.items?.length ? clipsQuery.data.items : SAMPLE_CLIPS;
  const savedSearches = savedSearchesQuery.data?.items?.length ? savedSearchesQuery.data.items : SAMPLE_SAVED_SEARCHES;

  const saveSearchMutation = useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: SavedSearch["filters"] }) => {
      if (teamId === "team-demo") return;
      await api(`/teams/${teamId}/film/saved-searches`, {
        method: "POST",
        body: JSON.stringify({ name, filters }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filmSavedSearches", teamId] });
    },
  });

  const deleteSearchMutation = useMutation({
    mutationFn: async (id: string) => {
      if (teamId === "team-demo") return;
      await api(`/teams/${teamId}/film/saved-searches/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filmSavedSearches", teamId] });
    },
  });

  const createMontageMutation = useMutation({
    mutationFn: async ({ title, description, clipIds }: { title: string; description: string; clipIds: string[] }) => {
      const selected = clips.filter((c) => clipIds.includes(c.id));
      const items = selected.map((c, i) => ({
        clipId: c.id,
        gameId: c.gameId,
        order: i + 1,
        startMs: c.startMs,
        endMs: c.endMs,
        title: `${c.gameTitle} (${Math.round(c.durationMs / 1000)}s)`,
        note: c.note ?? undefined,
        tags: c.tags,
      }));

      if (teamId === "team-demo") {
        setCreatedMontageId("montage-demo-success");
        return;
      }

      const res = await api<{ id: string }>(`/teams/${teamId}/film/montages`, {
        method: "POST",
        body: JSON.stringify({
          title,
          description: description || undefined,
          tags: Array.from(new Set(selected.flatMap((c) => c.tags))),
          items,
        }),
      });
      setCreatedMontageId(res.id);
    },
  });

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 6px 0", fontSize: 28, fontWeight: 800 }}>Film Library & Scouting Montages</h1>
        <p style={{ margin: 0, color: "var(--cq-text-muted, #6b7280)", fontSize: 15 }}>
          Search clips across all game film by tactical tags, keywords, and outcomes. Compile sequenced scouting reels to share with your team.
        </p>
        {createdMontageId && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 16px",
              background: "#dcfce7",
              border: "1px solid #86efac",
              borderRadius: 8,
              color: "#166534",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ✓ Scouting montage reel created successfully!
          </div>
        )}
      </div>

      <FilmSearch
        teamId={teamId}
        clips={clips}
        savedSearches={savedSearches}
        onSaveSearch={async (name, filters) => {
          await saveSearchMutation.mutateAsync({ name, filters });
        }}
        onDeleteSavedSearch={async (id) => {
          await deleteSearchMutation.mutateAsync(id);
        }}
        onCreateMontage={async (title, description, clipIds) => {
          await createMontageMutation.mutateAsync({ title, description, clipIds });
        }}
      />
    </main>
  );
}
