import React from "react";
import { tokens } from "../tokens";

export interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

const spinnerSizes = {
  sm: "16px",
  md: "24px",
  lg: "36px",
};

export function LoadingState({
  message = "Loading…",
  size = "md",
}: LoadingStateProps) {
  const dimension = spinnerSizes[size];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: tokens.spacing[2],
        padding: tokens.spacing[6],
        color: tokens.colors.text.muted,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: dimension,
          height: dimension,
          border: `2px solid ${tokens.colors.border.hover}`,
          borderTopColor: tokens.colors.brand.orange,
          borderRadius: tokens.radius.full,
          animation: "cq-spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: tokens.typography.sizes.sm }}>{message}</span>
    </div>
  );
}
