import { createECDH } from "node:crypto";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

// In-memory deterministic or generated VAPID keys for Web Push
let cachedKeys: VapidKeys | null = null;

export function getVapidKeys(): VapidKeys {
  if (cachedKeys) return cachedKeys;

  // Use fixed test/demo keys or generate valid P-256 keypair
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const rawPublic = ecdh.getPublicKey(); // 65-byte uncompressed point (0x04...)
  const rawPrivate = ecdh.getPrivateKey();

  cachedKeys = {
    publicKey: rawPublic.toString("base64url"),
    privateKey: rawPrivate.toString("base64url"),
  };

  return cachedKeys;
}

export function parseMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

export function getUserLocalMinutes(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    let hour = 0;
    let minute = 0;
    for (const p of parts) {
      if (p.type === "hour") hour = Number(p.value);
      if (p.type === "minute") minute = Number(p.value);
    }
    return hour * 60 + minute;
  } catch {
    // Fallback to UTC
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

/** Determines whether the current instant falls inside the user's quiet hours window. */
export function isInQuietHours(
  date: Date,
  startStr: string,
  endStr: string,
  timezone = "UTC"
): boolean {
  const start = parseMinutes(startStr);
  const end = parseMinutes(endStr);

  if (start === end) return false;

  const current = getUserLocalMinutes(date, timezone);

  if (start < end) {
    // Same-day window (e.g., 12:00 to 14:00)
    return current >= start && current < end;
  } else {
    // Overnight / cross-midnight window (e.g., 22:00 to 08:00)
    return current >= start || current < end;
  }
}
