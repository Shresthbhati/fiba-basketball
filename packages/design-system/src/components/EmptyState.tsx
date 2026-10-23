import React from "react";
import { tokens } from "../tokens";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
  };
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      style={{
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: "36px 24px",
        borderRadius: tokens.radius.lg,
        border: `1px dashed ${tokens.colors.border.default}`,
        background: tokens.colors.bg.surface,
        gap: tokens.spacing[3],
      }}
    >
      {icon && (
        <div style={{ fontSize: "2rem", color: tokens.colors.text.muted }} aria-hidden="true">
          {icon}
        </div>
      )}
      <div style={{ display: "grid", gap: "4px", maxWidth: "420px" }}>
        <h4
          style={{
            margin: 0,
            fontSize: tokens.typography.sizes.base,
            fontWeight: 600,
            color: tokens.colors.text.primary,
          }}
        >
          {title}
        </h4>
        {description && (
          <p
            style={{
              margin: 0,
              fontSize: tokens.typography.sizes.sm,
              color: tokens.colors.text.muted,
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && (
        <Button
          variant={action.variant ?? "primary"}
          size="sm"
          onClick={action.onClick}
          style={{ marginTop: tokens.spacing[1] }}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
