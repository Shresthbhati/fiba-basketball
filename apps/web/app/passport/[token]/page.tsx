"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { PassportView, type PassportData } from "../../../lib/passport-view";

export default function PublicPassportPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["passport", token],
    queryFn: () => api<PassportData>(`/passport/${token}`),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={{ maxWidth: 700, margin: "60px auto", textAlign: "center", color: "#9ca3af" }}>
        Loading athlete career passport...
      </div>
    );
  }

  if (error || !data) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <div
        role="alert"
        style={{
          maxWidth: 600,
          margin: "60px auto",
          padding: 24,
          borderRadius: 12,
          backgroundColor: "#161822",
          border: "1px solid #374151",
          textAlign: "center",
          color: "#f8fafc",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: "1.3rem" }}>
          {is404 ? "Passport Not Found or Expired" : "Unable to Load Passport"}
        </h2>
        <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.9rem" }}>
          {is404
            ? "This shareable career link has expired, been revoked by the athlete, or does not exist."
            : "An unexpected error occurred while loading this athlete passport."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <PassportView data={data} />
    </div>
  );
}
