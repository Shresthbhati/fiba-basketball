import type { TacticalKeyframe, TacticalToken, TacticalAction } from "@courtiq/court-renderer";

/**
 * Smooth quadratic ease-in-out interpolation factor.
 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export interface InterpolatedFrame {
  currentStep: number;
  tokens: TacticalToken[];
  actions: TacticalAction[];
  description: string;
}

/**
 * Deterministically interpolates between keyframes given a continuous progress value.
 * Progress ranges from 0 to keyframes.length - 1.
 * ADR-0007: Level 1 deterministic diagrammatic animation only.
 */
export function interpolateKeyframes(
  keyframes: TacticalKeyframe[],
  progress: number
): InterpolatedFrame {
  if (keyframes.length === 0) {
    return { currentStep: 1, tokens: [], actions: [], description: "" };
  }
  if (keyframes.length === 1) {
    const kf = keyframes[0]!;
    return {
      currentStep: kf.step,
      tokens: kf.tokens,
      actions: kf.actions,
      description: kf.description,
    };
  }

  // Clamp progress
  const maxIdx = keyframes.length - 1;
  const clampedProgress = Math.max(0, Math.min(progress, maxIdx));

  const fromIdx = Math.floor(clampedProgress);
  const toIdx = Math.min(fromIdx + 1, maxIdx);
  const rawAlpha = clampedProgress - fromIdx;
  const alpha = easeInOutQuad(rawAlpha);

  const fromKf = keyframes[fromIdx]!;
  const toKf = keyframes[toIdx]!;

  // Build token lookup for fast matching by ID
  const toTokenMap = new Map<string, TacticalToken>(toKf.tokens.map((t) => [t.id, t]));

  const interpolatedTokens: TacticalToken[] = fromKf.tokens.map((fromToken) => {
    const toToken = toTokenMap.get(fromToken.id);
    if (!toToken) {
      return fromToken;
    }

    return {
      id: fromToken.id,
      type: fromToken.type,
      label: fromToken.label,
      x: Math.round((fromToken.x + (toToken.x - fromToken.x) * alpha) * 100) / 100,
      y: Math.round((fromToken.y + (toToken.y - fromToken.y) * alpha) * 100) / 100,
    };
  });

  // Also include tokens that exist in toKf but not fromKf
  for (const toToken of toKf.tokens) {
    if (!interpolatedTokens.some((t) => t.id === toToken.id)) {
      interpolatedTokens.push(toToken);
    }
  }

  // Active actions: if past halfway, show target frame's actions; otherwise from frame's actions
  const activeActions = rawAlpha < 0.5 ? fromKf.actions : toKf.actions;
  const activeDescription = rawAlpha < 0.5 ? fromKf.description : toKf.description;

  return {
    currentStep: fromKf.step,
    tokens: interpolatedTokens,
    actions: activeActions,
    description: activeDescription,
  };
}
