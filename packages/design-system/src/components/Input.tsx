import React, { useId } from "react";
import { tokens } from "../tokens";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, id: explicitId, style, ...rest },
  ref
) {
  const autoId = useId();
  const id = explicitId || autoId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const ariaDescribedBy = [
    error ? errorId : undefined,
    hint ? hintId : undefined,
  ].filter(Boolean).join(" ") || undefined;

  return (
    <div style={{ display: "grid", gap: tokens.spacing[1], width: "100%" }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            fontSize: tokens.typography.sizes.sm,
            fontWeight: 500,
            color: tokens.colors.text.secondary,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {label}
          {required && (
            <span style={{ color: tokens.colors.brand.orange }} aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={ariaDescribedBy}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: tokens.typography.sizes.sm,
          fontFamily: tokens.typography.fonts.sans,
          background: tokens.colors.bg.surface,
          color: tokens.colors.text.primary,
          border: `1px solid ${error ? tokens.colors.status.danger : tokens.colors.border.default}`,
          borderRadius: tokens.radius.md,
          outline: "none",
          boxSizing: "border-box",
          ...style,
        }}
        {...rest}
      />

      {error ? (
        <span
          id={errorId}
          role="alert"
          style={{
            fontSize: tokens.typography.sizes.xs,
            color: tokens.colors.status.danger,
            marginTop: "2px",
          }}
        >
          {error}
        </span>
      ) : hint ? (
        <span
          id={hintId}
          style={{
            fontSize: tokens.typography.sizes.xs,
            color: tokens.colors.text.muted,
            marginTop: "2px",
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
});
