import React, { useEffect, useId, useRef } from "react";
import { tokens } from "../tokens";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: tokens.spacing[4],
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        style={{
          width: "100%",
          maxWidth: "480px",
          background: tokens.colors.bg.surface,
          border: `1px solid ${tokens.colors.border.hover}`,
          borderRadius: tokens.radius.lg,
          padding: tokens.spacing[5],
          display: "grid",
          gap: tokens.spacing[4],
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontSize: tokens.typography.sizes.lg,
                fontWeight: 700,
                color: tokens.colors.text.primary,
              }}
            >
              {title}
            </h2>
            {description && (
              <p
                id={descId}
                style={{
                  margin: "4px 0 0 0",
                  fontSize: tokens.typography.sizes.sm,
                  color: tokens.colors.text.muted,
                }}
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: "transparent",
              border: "none",
              color: tokens.colors.text.muted,
              cursor: "pointer",
              fontSize: "1.2rem",
              padding: "4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div>{children}</div>

        {actions && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: tokens.spacing[2],
              paddingTop: tokens.spacing[3],
              borderTop: `1px solid ${tokens.colors.border.default}`,
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
