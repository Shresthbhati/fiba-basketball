import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const HMAC_SECRET = process.env.SESSION_SECRET || "courtiq-totp-challenge-default-secret-2026";

/**
 * Base32 RFC 4648 encoding without padding.
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Base32 RFC 4648 decoding.
 */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]!);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generates a 20-byte cryptographically secure random base32 secret.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Computes RFC 6238 6-digit TOTP code for a given timestamp.
 */
export function generateTotpCode(secret: string, timestampMs = Date.now(), period = 30): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timestampMs / 1000 / period);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    (((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff)) %
    1000000;
  return String(code).padStart(6, "0");
}

/**
 * Verifies a 6-digit code with +/- 1 period clock skew tolerance (90-second total window).
 */
export function verifyTotpCode(secret: string, code: string, timestampMs = Date.now(), period = 30): boolean {
  if (!code || !/^\d{6}$/.test(code.trim())) return false;
  const target = code.trim();
  for (let step = -1; step <= 1; step++) {
    const t = timestampMs + step * period * 1000;
    const computed = generateTotpCode(secret, t, period);
    if (computed === target) {
      return true;
    }
  }
  return false;
}

/**
 * Generates standard otpauth URI compatible with Google Authenticator, 1Password, Apple Passwords.
 */
export function generateOtpauthUri(email: string, secret: string, issuer = "COURT IQ"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const sha256 = (str: string) => createHash("sha256").update(str).digest("hex");

/**
 * Generates single-use backup recovery codes.
 */
export function generateRecoveryCodes(count = 8): { codes: string[]; hashedCodes: string[] } {
  const codes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString("hex"); // 8 chars e.g. "a1b2c3d4"
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4)}`; // "a1b2-c3d4"
    codes.push(formatted);
    hashedCodes.push(sha256(raw.toLowerCase()));
  }
  return { codes, hashedCodes };
}

/**
 * Verifies and consumes a backup recovery code if valid.
 */
export function verifyAndConsumeRecoveryCode(
  hashedCodesJson: string | null,
  candidate: string
): { valid: boolean; remainingHashedCodesJson: string | null } {
  if (!hashedCodesJson || !candidate) {
    return { valid: false, remainingHashedCodesJson: hashedCodesJson };
  }
  try {
    const list = JSON.parse(hashedCodesJson) as string[];
    if (!Array.isArray(list)) return { valid: false, remainingHashedCodesJson: hashedCodesJson };

    const norm = candidate.trim().toLowerCase().replace(/[\s-]/g, "");
    const candidateHash = sha256(norm);

    const index = list.indexOf(candidateHash);
    if (index !== -1) {
      // Consume code
      list.splice(index, 1);
      return { valid: true, remainingHashedCodesJson: JSON.stringify(list) };
    }
  } catch {
    // Malformed JSON
  }
  return { valid: false, remainingHashedCodesJson: hashedCodesJson };
}

/**
 * Creates a short-lived (5 min) challenge token for 2FA login verification.
 */
export function createMfaChallengeToken(userId: string): string {
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + 5 * 60 * 1000,
    nonce: randomBytes(8).toString("hex"),
  });
  const b64Payload = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", HMAC_SECRET).update(b64Payload).digest("base64url");
  return `${b64Payload}.${sig}`;
}

/**
 * Verifies an MFA challenge token and returns userId if valid.
 */
export function verifyMfaChallengeToken(token: string): { valid: boolean; userId: string | null } {
  if (!token || !token.includes(".")) return { valid: false, userId: null };
  const [b64Payload, sig] = token.split(".");
  if (!b64Payload || !sig) return { valid: false, userId: null };

  const expectedSig = createHmac("sha256", HMAC_SECRET).update(b64Payload).digest("base64url");
  try {
    const isSigValid = timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    if (!isSigValid) return { valid: false, userId: null };

    const decoded = JSON.parse(Buffer.from(b64Payload, "base64url").toString("utf8")) as {
      userId?: string;
      exp?: number;
    };

    if (!decoded.userId || typeof decoded.exp !== "number") {
      return { valid: false, userId: null };
    }

    if (Date.now() > decoded.exp) {
      return { valid: false, userId: null }; // expired
    }

    return { valid: true, userId: decoded.userId };
  } catch {
    return { valid: false, userId: null };
  }
}
