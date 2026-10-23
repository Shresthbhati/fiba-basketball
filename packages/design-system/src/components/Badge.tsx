import React from "react";
import { tokens } from "../tokens";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "brand" | "neutral" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
}

const variantStyles: Record<
  "brand" | "neutral" | "success" | "warning" | "danger" | "info",
  React.CSSProperties
> = {
  brand: {
    background: tokens.colors.brand.orangeMuted,
    color: tokens.colors.brand.orange,
    borderColor: tokens.colors.brand.orange,
  },
  neutral: {
    background: tokens.colors.bg.surfaceElevated,
    color: tokens.colors.text.secondary,
    borderColor: tokens.colors.border.default,
  },
  success: {
    background: tokens.colors.status.successMuted,
    color: tokens.colors.status.success,
    borderColor: tokens.colors.status.success,
  },
  warning: {
    background: tokens.colors.status.warningMuted,
    color: tokens.colors.status.warning,
    borderColor: tokens.colors.status.warning,
  },
  danger: {
    background: tokens.colors.status.dangerMuted,
    color: tokens.colors.status.danger,
    borderColor: tokens.colors.status.danger,
  },
  info: {
    background: tokens.colors.status.infoMuted,
    color: tokens.colors.status.info,
    borderColor: tokens.colors.status.info,
  },
};

export function Badge({
  variant = "neutral",
  size = "md",
  children,
  style,
  ...rest
}: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        borderRadius: tokens.radius.full,
        border: "1px solid",
        padding: size === "sm" ? "2px 6px" : "3px 8px",
        fontSize: size === "sm" ? "0.65rem" : tokens.typography.sizes.xs,
        lineHeight: 1,
        ...variantStyles[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
