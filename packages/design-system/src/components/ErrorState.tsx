import React from "react";
import { tokens } from "../tokens";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      style={{
        display: "grid",
        gap: tokens.spacing[3],
        padding: "20px 24px",
        borderRadius: tokens.radius.md,
        border: `1px solid ${tokens.colors.status.danger}`,
        background: tokens.colors.status.dangerMuted,
        color: tokens.colors.text.primary,
      }}
    >
      <div style={{ display: "grid", gap: "4px" }}>
        <h4
          style={{
            margin: 0,
            fontSize: tokens.typography.sizes.sm,
            fontWeight: 700,
            color: tokens.colors.status.danger,
          }}
        >
          {title}
        </h4>
        <p style={{ margin: 0, fontSize: tokens.typography.sizes.sm, color: tokens.colors.text.secondary }}>
          {message}
        </p>
      </div>
      {onRetry && (
        <div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
