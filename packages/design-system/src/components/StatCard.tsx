import React from "react";
import { tokens } from "../tokens";

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
  };
  highlight?: boolean;
}

export function StatCard({
  label,
  value,
  hint,
  trend,
  highlight = false,
}: StatCardProps) {
  const trendColor =
    trend?.direction === "up"
      ? tokens.colors.status.success
      : trend?.direction === "down"
      ? tokens.colors.status.danger
      : tokens.colors.text.muted;

  const trendIcon =
    trend?.direction === "up" ? "▲" : trend?.direction === "down" ? "▼" : "•";

  return (
    <div
      style={{
        background: tokens.colors.bg.surface,
        border: `1px solid ${highlight ? tokens.colors.brand.orange : tokens.colors.border.default}`,
        borderRadius: tokens.radius.md,
        padding: "12px 14px",
        display: "grid",
        gap: "4px",
      }}
    >
      <div
        style={{
          fontSize: tokens.typography.sizes.xs,
          color: highlight ? tokens.colors.brand.orange : tokens.colors.text.muted,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.4rem",
          fontWeight: 700,
          fontFamily: tokens.typography.fonts.mono,
          color: highlight ? tokens.colors.brand.orange : tokens.colors.text.primary,
        }}
      >
        {value}
      </div>
      {(hint || trend) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: tokens.typography.sizes.xs,
          }}
        >
          {trend && (
            <span style={{ color: trendColor, fontWeight: 600 }}>
              {trendIcon} {trend.label}
            </span>
          )}
          {hint && (
            <span style={{ color: tokens.colors.text.subtle }}>{hint}</span>
          )}
        </div>
      )}
    </div>
  );
}
