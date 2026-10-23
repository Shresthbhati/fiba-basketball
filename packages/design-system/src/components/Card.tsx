import React from "react";
import { tokens } from "../tokens";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingMap = {
  none: "0",
  sm: tokens.spacing[3],
  md: tokens.spacing[4],
  lg: tokens.spacing[6],
};

export function Card({
  title,
  subtitle,
  badge,
  actions,
  padding = "md",
  children,
  style,
  ...rest
}: CardProps) {
  const hasHeader = title || subtitle || badge || actions;

  return (
    <div
      style={{
        background: tokens.colors.bg.surface,
        border: `1px solid ${tokens.colors.border.default}`,
        borderRadius: tokens.radius.lg,
        padding: paddingMap[padding],
        display: "grid",
        gap: tokens.spacing[3],
        ...style,
      }}
      {...rest}
    >
      {hasHeader && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: tokens.spacing[3],
          }}
        >
          <div style={{ display: "grid", gap: "2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing[2] }}>
              {typeof title === "string" ? (
                <h3
                  style={{
                    margin: 0,
                    fontSize: tokens.typography.sizes.base,
                    fontWeight: 600,
                    color: tokens.colors.text.primary,
                  }}
                >
                  {title}
                </h3>
              ) : (
                title
              )}
              {badge}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: tokens.typography.sizes.xs,
                  color: tokens.colors.text.muted,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {actions && (
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing[2] }}>
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
