"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../../../../lib/api";
import { EmbedWidget, type EmbedSummary } from "../../../../../lib/embed-widget";

export default function BracketEmbedPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const theme = (searchParams.get("theme") as "dark" | "light" | "transparent") || "dark";
  const compact = searchParams.get("compact") === "true";

  const { data, isLoading, error } = useQuery({
    queryKey: ["embed-competition-bracket", id],
    queryFn: () => api<EmbedSummary>(`/embed/competitions/${id}/summary`),
    retry: false,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>Loading bracket…</div>;
  }

  if (error) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#f87171" }}>
        <h3>{is404 ? "Tournament Not Found" : "Unable to load bracket"}</h3>
      </div>
    );
  }

  if (!data) return null;

  return <EmbedWidget summary={data} view="bracket" theme={theme} compact={compact} />;
}
