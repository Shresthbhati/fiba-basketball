import React from "react";
import { Badge, type BadgeProps } from "./Badge";

export type VerificationStatus =
  | "UNVERIFIED"
  | "SELF_REPORTED"
  | "COMMUNITY_VERIFIED"
  | "OFFICIAL"
  | "CV_ESTIMATE";

export interface VerificationBadgeProps extends Omit<BadgeProps, "variant" | "children"> {
  status: VerificationStatus;
}

const statusConfig: Record<
  VerificationStatus,
  { label: string; variant: BadgeProps["variant"]; icon: string; title: string }
> = {
  OFFICIAL: {
    label: "Official",
    variant: "brand",
    icon: "✓",
    title: "Officially certified / referee confirmed",
  },
  COMMUNITY_VERIFIED: {
    label: "Verified",
    variant: "success",
    icon: "✓",
    title: "Verified by community quorum",
  },
  CV_ESTIMATE: {
    label: "CV Estimate",
    variant: "info",
    icon: "👁",
    title: "Estimated via computer vision",
  },
  SELF_REPORTED: {
    label: "Self-Reported",
    variant: "warning",
    icon: "✎",
    title: "Logged directly by player",
  },
  UNVERIFIED: {
    label: "Unverified",
    variant: "neutral",
    icon: "○",
    title: "Pending verification",
  },
};

export function VerificationBadge({ status, ...rest }: VerificationBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.UNVERIFIED;

  return (
    <Badge
      variant={config.variant}
      title={config.title}
      aria-label={`Verification status: ${config.label}`}
      {...rest}
    >
      <span aria-hidden="true">{config.icon}</span>
      <span>{config.label}</span>
    </Badge>
  );
}
