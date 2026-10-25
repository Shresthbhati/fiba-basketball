"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { EmbedWidget, type EmbedSummary } from "../../../../lib/embed-widget";

export default function CompetitionEmbedPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const theme = (searchParams.get("theme") as "dark" | "light" | "transparent") || "dark";
  const compact = searchParams.get("compact") === "true";
  const view = (searchParams.get("view") as "all" | "standings" | "bracket" | "schedule") || "all";

  const { data, isLoading, error } = useQuery({
    queryKey: ["embed-competition", id],
    queryFn: () => api<EmbedSummary>(`/embed/competitions/${id}/summary`),
    retry: false,
    refetchInterval: 60_000, // 60-second auto-poll for live tournament scores
  });

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: theme === "light" ? "#64748b" : "#94a3b8" }}>
        Loading tournament data…
      </div>
    );
  }

  if (error) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#f87171" }}>
        <h3>{is404 ? "Tournament Not Found" : "Unable to load tournament"}</h3>
        <p style={{ fontSize: 13, color: "#94a3b8" }}>
          {is404
            ? "This competition is not published or does not exist."
            : error.message}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return <EmbedWidget summary={data} view={view} theme={theme} compact={compact} />;
}
