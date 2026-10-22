export const Role = ["ORGANIZER", "COACH", "PLAYER"] as const;
export type Role = (typeof Role)[number];
