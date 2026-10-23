import React from "react";
import { tokens } from "../tokens";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const sizeStyles: Record<"sm" | "md" | "lg", React.CSSProperties> = {
  sm: { padding: "6px 12px", fontSize: tokens.typography.sizes.xs },
  md: { padding: "8px 16px", fontSize: tokens.typography.sizes.sm },
  lg: { padding: "12px 24px", fontSize: tokens.typography.sizes.base },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    icon,
    disabled,
    children,
    style,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  const baseStyle: React.CSSProperties = {
    display: fullWidth ? "flex" : "inline-flex",
    width: fullWidth ? "100%" : "auto",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing[2],
    fontWeight: 600,
    fontFamily: tokens.typography.fonts.sans,
    borderRadius: tokens.radius.md,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.6 : 1,
    transition: `background ${tokens.transition.fast}, border-color ${tokens.transition.fast}, color ${tokens.transition.fast}`,
    border: "1px solid transparent",
    outline: "none",
    ...sizeStyles[size],
    ...style,
  };

  let variantStyle: React.CSSProperties = {};
  if (variant === "primary") {
    variantStyle = {
      background: tokens.colors.brand.orange,
      color: tokens.colors.text.inverse,
      borderColor: tokens.colors.brand.orange,
    };
  } else if (variant === "secondary") {
    variantStyle = {
      background: tokens.colors.bg.surfaceElevated,
      color: tokens.colors.text.primary,
      borderColor: tokens.colors.border.default,
    };
  } else if (variant === "danger") {
    variantStyle = {
      background: tokens.colors.status.danger,
      color: "#ffffff",
      borderColor: tokens.colors.status.danger,
    };
  } else if (variant === "ghost") {
    variantStyle = {
      background: "transparent",
      color: tokens.colors.text.primary,
      borderColor: "transparent",
    };
  }

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading}
      style={{ ...baseStyle, ...variantStyle }}
      {...rest}
    >
      {loading ? (
        <span
          role="status"
          aria-label="Loading"
          style={{
            display: "inline-block",
            width: "1em",
            height: "1em",
            border: "2px solid currentColor",
            borderRightColor: "transparent",
            borderRadius: "50%",
            animation: "cq-spin 0.6s linear infinite",
          }}
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
