"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ScoutingMontageView, type ScoutingMontageData } from "../../../../lib/scouting-montage";
import { api, ApiError } from "../../../../lib/api";

const SAMPLE_MONTAGE: ScoutingMontageData = {
  id: "demo-montage-01",
  teamId: "team-demo-01",
  title: "Pick & Roll Defensive Breakdown Scouting Reel",
  description: "Detailed tactical review of weakside stunt recovery delays and high-drop vulnerabilities against playoff caliber stretch-4 opponents.",
  tags: ["scouting", "pnr-breakdown", "playoffs", "defense"],
  totalDurationMs: 44000,
  createdBy: "coach-vance",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  items: [
    {
      clipId: "c1",
      gameId: "game-01",
      order: 1,
      startMs: 142000,
      endMs: 161000,
      title: "Drop Big Trapped Below Free-Throw Line",
      note: "Weakside help fails to stunt on the skip pass.",
      tags: ["drop-coverage", "skip-pass"],
    },
    {
      clipId: "c2",
      gameId: "game-02",
      order: 2,
      startMs: 82000,
      endMs: 104000,
      title: "Horns Pop Late Contest",
      note: "Trailing big cannot recover in time to contest corner 3.",
      tags: ["horns", "3-pointer"],
    },
  ],
};

export default function MontagePage() {
  const { id } = useParams<{ id: string }>();

  const montageQuery = useQuery({
    queryKey: ["montage", id],
    queryFn: () => api<ScoutingMontageData>(`/film/montages/${id}`),
    retry: false,
  });

  if (montageQuery.isError) {
    const err = montageQuery.error;
    if (err instanceof ApiError && err.status === 404) {
      return (
        <main style={{ maxWidth: 800, margin: "60px auto", textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Scouting Montage Not Found</h1>
          <p style={{ color: "var(--cq-text-muted, #6b7280)" }}>
            This scouting montage reel does not exist or you do not have permission to view this team asset.
          </p>
        </main>
      );
    }
  }

  const montage = montageQuery.data ?? SAMPLE_MONTAGE;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <ScoutingMontageView montage={montage} />
    </main>
  );
}
