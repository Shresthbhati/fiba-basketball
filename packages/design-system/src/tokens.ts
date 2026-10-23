export const tokens = {
  colors: {
    bg: {
      canvas: "#0a0a0c",
      surface: "#141418",
      surfaceElevated: "#1c1c24",
      surfaceHighlight: "#252532",
    },
    text: {
      primary: "#f3f4f6",
      secondary: "#d1d5db",
      muted: "#9ca3af",
      subtle: "#6b7280",
      inverse: "#0a0a0c",
    },
    border: {
      default: "rgba(255, 255, 255, 0.08)",
      hover: "rgba(255, 255, 255, 0.16)",
      focus: "#f97316",
    },
    brand: {
      orange: "#f97316",
      orangeMuted: "rgba(249, 115, 22, 0.15)",
      orangeHover: "#ea580c",
      amber: "#f59e0b",
      amberMuted: "rgba(245, 158, 11, 0.15)",
    },
    status: {
      success: "#22c55e",
      successMuted: "rgba(34, 197, 94, 0.15)",
      warning: "#f59e0b",
      warningMuted: "rgba(245, 158, 11, 0.15)",
      danger: "#ef4444",
      dangerMuted: "rgba(239, 68, 68, 0.15)",
      info: "#3b82f6",
      infoMuted: "rgba(59, 130, 246, 0.15)",
    },
  },
  typography: {
    fonts: {
      sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    },
    sizes: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
    },
  },
  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    full: "9999px",
  },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
  },
  transition: {
    fast: "150ms ease",
    default: "200ms ease",
  },
} as const;

export type ThemeTokens = typeof tokens;
