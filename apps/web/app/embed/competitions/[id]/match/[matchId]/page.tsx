"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../../../../../lib/api";
import { LiveScoreboardWidget, type EmbedMatchScoreboardData } from "../../../../../../lib/live-scoreboard-widget";

export default function MatchScoreboardEmbedPage() {
  const params = useParams<{ id: string; matchId: string }>();
  const searchParams = useSearchParams();

  const competitionId = params?.id;
  const matchId = params?.matchId;

  const theme = (searchParams?.get("theme") as "dark" | "light" | "transparent") || "dark";
  const compact = searchParams?.get("compact") === "true";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["embed-match-scoreboard", competitionId, matchId],
    queryFn: () =>
      api<EmbedMatchScoreboardData>(`/embed/competitions/${competitionId}/matches/${matchId}`),
    retry: false,
    refetchInterval: 10_000, // 10s auto-refresh fallback in addition to SSE
  });

  if (isLoading) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: theme === "light" ? "#64748b" : "#94a3b8",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Loading live scoreboard…
      </div>
    );
  }

  if (error) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "#f87171",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h3 style={{ margin: "0 0 8px 0" }}>{is404 ? "Match Not Found" : "Unable to load match"}</h3>
        <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
          {is404
            ? "This match or tournament is not published or does not exist."
            : error.message}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ padding: compact ? 0 : 16 }}>
      <LiveScoreboardWidget
        initialData={data}
        theme={theme}
        compact={compact}
        enableSse={true}
        onRefresh={() => {
          refetch();
        }}
      />
    </div>
  );
}
