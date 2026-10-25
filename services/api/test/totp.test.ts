import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateOtpauthUri,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  createMfaChallengeToken,
  verifyMfaChallengeToken,
} from "../src/identity/totp.js";
import { adultBody, cookieOf, testApp } from "./helpers.js";
import { grantRole } from "../src/authz/service.js";

describe("RFC 6238 TOTP Engine", () => {
  it("generates base32 secret and valid 6-digit codes", () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(32);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);

    const now = Date.now();
    const code = generateTotpCode(secret, now);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);

    // Verifies with tolerance
    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, code, now + 25000)).toBe(true); // +25s within window
    expect(verifyTotpCode(secret, code, now - 25000)).toBe(true); // -25s within window

    // Rejects invalid codes
    expect(verifyTotpCode(secret, "000000", now)).toBe(code === "000000");
    expect(verifyTotpCode(secret, "abcdef", now)).toBe(false);
    expect(verifyTotpCode(secret, "", now)).toBe(false);

    // Rejects outside +/- 1 step (> 60s)
    expect(verifyTotpCode(secret, code, now + 95000)).toBe(false);
  });

  it("formats standard otpauth URI", () => {
    const uri = generateOtpauthUri("coach@courtiq.net", "JBSWY3DPEHPK3PXP");
    expect(uri).toContain("otpauth://totp/COURT%20IQ:coach%40courtiq.net");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=COURT%20IQ");
  });

  it("handles single-use hashed recovery codes", () => {
    const { codes, hashedCodes } = generateRecoveryCodes(4);
    expect(codes).toHaveLength(4);
    expect(hashedCodes).toHaveLength(4);

    const json = JSON.stringify(hashedCodes);
    const candidate = codes[0]!;

    // First use: valid
    const r1 = verifyAndConsumeRecoveryCode(json, candidate);
    expect(r1.valid).toBe(true);
    expect(JSON.parse(r1.remainingHashedCodesJson!)).toHaveLength(3);

    // Second use of same code: invalid (already consumed)
    const r2 = verifyAndConsumeRecoveryCode(r1.remainingHashedCodesJson, candidate);
    expect(r2.valid).toBe(false);

    // Bogus code: invalid
    const r3 = verifyAndConsumeRecoveryCode(r1.remainingHashedCodesJson, "xxxx-yyyy");
    expect(r3.valid).toBe(false);
  });

  it("creates and verifies cryptographic MFA login challenge tokens", () => {
    const token = createMfaChallengeToken("usr_123");
    expect(token).toContain(".");

    const res = verifyMfaChallengeToken(token);
    expect(res.valid).toBe(true);
    expect(res.userId).toBe("usr_123");

    // Tampered token fails
    const tampered = token.slice(0, -4) + "abcd";
    expect(verifyMfaChallengeToken(tampered).valid).toBe(false);
  });
});

describe("Two-Factor Authentication API (Spec §1.1, §2.2, WP-1.1)", () => {
  it("completes full TOTP enrollment flow, status check, and MFA login challenge", async () => {
    const { app } = await testApp();

    // 1. Sign up normal user
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: adultBody({ email: "athlete@courtiq.net" }),
    });
    expect(signupRes.statusCode).toBe(201);
    const cookie = cookieOf(signupRes);

    // Status is initially disabled
    const st1 = await app.inject({
      method: "GET",
      url: "/api/v1/auth/totp/status",
      headers: { cookie },
    });
    expect(st1.statusCode).toBe(200);
    expect(st1.json().enabled).toBe(false);

    // 2. Setup TOTP
    const setupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/totp/setup",
      headers: { cookie },
    });
    expect(setupRes.statusCode).toBe(200);
    const { secret, uri, recoveryCodes } = setupRes.json();
    expect(secret).toBeDefined();
    expect(uri).toContain("athlete%40courtiq.net");
    expect(recoveryCodes).toHaveLength(8);

    // 3. Confirm with wrong code -> 400
    const failEnable = await app.inject({
      method: "POST",
      url: "/api/v1/auth/totp/enable",
      headers: { cookie },
      payload: { code: "000000" },
    });
    expect(failEnable.statusCode).toBe(400);

    // 4. Confirm with valid code -> 200
    const validCode = generateTotpCode(secret);
    const okEnable = await app.inject({
      method: "POST",
      url: "/api/v1/auth/totp/enable",
      headers: { cookie },
      payload: { code: validCode },
    });
    expect(okEnable.statusCode).toBe(200);

    // Status is now enabled
    const st2 = await app.inject({
      method: "GET",
      url: "/api/v1/auth/totp/status",
      headers: { cookie },
    });
    expect(st2.json().enabled).toBe(true);

    // 5. Next login requires second factor
    const login1 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "athlete@courtiq.net", password: "correct-horse-battery" },
    });
    expect(login1.statusCode).toBe(200);
    expect(login1.json().requiresTotp).toBe(true);
    expect(login1.json().challengeToken).toBeDefined();
    expect(login1.headers["set-cookie"]).toBeUndefined(); // no session cookie yet!

    // 6. Complete challenge with bad code -> 401
    const badChallenge = await app.inject({
      method: "POST",
      url: "/api/v1/auth/totp/challenge",
      payload: { challengeToken: login1.json().challengeToken, code: "123456" },
    });
    expect(badChallenge.statusCode).toBe(401);

    // 7. Complete challenge with valid TOTP code -> 200 and sets session cookie
    const freshCode = generateTotpCode(secret);
    const okChallenge = await app.inject({
      method: "POST",
      url: "/api/v1/auth/totp/challenge",
      payload: { challengeToken: login1.json().challengeToken, code: freshCode },
    });
    expect(okChallenge.statusCode).toBe(200);
    expect(okChallenge.headers["set-cookie"]).toBeDefined();

    // Authenticated session verified
    const mfaCookie = cookieOf(okChallenge);
    const meRes = await app.inject({ url: "/api/v1/me", headers: { cookie: mfaCookie } });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().email).toBe("athlete@courtiq.net");
    expect(meRes.json().totpEnabled).toBe(true);

    // 8. Test backup recovery code authentication
    const login2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "athlete@courtiq.net", password: "correct-horse-battery" },
    });
    const backupCode = recoveryCodes[0];
    const okRecovery = await app.inject({
      method: "POST",
      url: "/api/v1/auth/totp/challenge",
      payload: { challengeToken: login2.json().challengeToken, code: backupCode },
    });
    expect(okRecovery.statusCode).toBe(200);
    expect(okRecovery.headers["set-cookie"]).toBeDefined();

    // Reusing the same recovery code fails
    const login3 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "athlete@courtiq.net", password: "correct-horse-battery" },
    });
    const reusedRecovery = await app.inject({
      method: "POST",
      url: "/api/v1/auth/totp/challenge",
      payload: { challengeToken: login3.json().challengeToken, code: backupCode },
    });
    expect(reusedRecovery.statusCode).toBe(401);
  });

  it("enforces mandatory TOTP MFA for PLATFORM_ADMIN and blocks disabling MFA", async () => {
    const { app, db } = await testApp();

    // Create user and grant PLATFORM_ADMIN
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: adultBody({ email: "admin@courtiq.net" }),
    });
    const adminUser = signupRes.json();
    const cookie = cookieOf(signupRes);
    await grantRole(db, adminUser.id, "PLATFORM_ADMIN");

    // Login for PLATFORM_ADMIN mandates TOTP challenge
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@courtiq.net", password: "correct-horse-battery" },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().requiresTotp).toBe(true);
    expect(loginRes.json().challengeToken).toBeDefined();

    // Admin attempts to disable TOTP -> 403 Forbidden
    const disableRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/totp/disable",
      headers: { cookie },
      payload: { password: "correct-horse-battery", code: "000000" },
    });
    expect(disableRes.statusCode).toBe(403);
    const body = disableRes.json();
    expect(body.title ?? body.detail ?? body.message).toContain("Platform administrators are strictly required");
  });
});
