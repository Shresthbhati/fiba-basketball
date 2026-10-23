import React from "react";
import { Badge, type BadgeProps } from "./Badge";

export type SourceType =
  | "OFFICIAL"
  | "SENSOR"
  | "CV_ESTIMATE"
  | "COACH"
  | "SELF_REPORTED"
  | "MODEL_INFERENCE";

export interface SourceBadgeProps extends Omit<BadgeProps, "variant" | "children"> {
  sourceType: SourceType;
  confidence?: number;
}

const sourceConfig: Record<
  SourceType,
  { label: string; variant: BadgeProps["variant"] }
> = {
  OFFICIAL: { label: "Official", variant: "brand" },
  SENSOR: { label: "Sensor", variant: "info" },
  CV_ESTIMATE: { label: "CV Track", variant: "info" },
  COACH: { label: "Coach", variant: "success" },
  SELF_REPORTED: { label: "Manual", variant: "warning" },
  MODEL_INFERENCE: { label: "AI Model", variant: "neutral" },
};

export function SourceBadge({ sourceType, confidence, ...rest }: SourceBadgeProps) {
  const config = sourceConfig[sourceType] ?? { label: sourceType, variant: "neutral" };
  const formattedConfidence =
    confidence !== undefined ? `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%` : null;

  return (
    <Badge
      variant={config.variant}
      title={
        formattedConfidence
          ? `Source: ${config.label} (${formattedConfidence} confidence)`
          : `Source: ${config.label}`
      }
      aria-label={
        formattedConfidence
          ? `Source ${config.label}, ${formattedConfidence} confidence`
          : `Source ${config.label}`
      }
      {...rest}
    >
      <span>{config.label}</span>
      {formattedConfidence && (
        <span style={{ opacity: 0.8, fontSize: "0.9em" }}>· {formattedConfidence}</span>
      )}
    </Badge>
  );
}
