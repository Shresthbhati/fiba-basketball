import type { CourtPoint } from "./coords";

export type TokenType = "offense" | "defense" | "ball";

export interface TacticalToken {
  id: string;
  type: TokenType;
  label: string;
  x: number; // in court meters
  y: number; // in court meters
}

export type ActionPathType = "cut" | "pass" | "dribble" | "screen" | "slide";

export interface TacticalAction {
  id: string;
  type: ActionPathType;
  from: CourtPoint;
  to: CourtPoint;
  label?: string;
}

export interface TacticalKeyframe {
  step: number;
  description: string;
  tokens: TacticalToken[];
  actions: TacticalAction[];
}

export interface TacticalPlay {
  id: string;
  title: string;
  description?: string;
  category: "offense" | "defense" | "inbound" | "set_piece" | "press_break";
  courtMode: "half" | "full";
  tags: string[];
  keyframes: TacticalKeyframe[];
  version: number;
}
