# identity

- `users`: id (uuid), email (unique, lowercased), password_hash (argon2id), display_name, date_of_birth, is_minor, email_verified_at, email_notifications, totp_secret, totp_enabled, totp_recovery_codes (hashed), totp_verified_at, created_at.
- `sessions`: token_hash (sha256 of opaque cookie token, PK), user_id, is_mfa_verified, expires_at (14 days), created_at.

API:
- Core Auth: `POST /api/v1/auth/signup|login|logout`, `GET /api/v1/me`. Auth endpoints are rate-limited (10/min/IP).
- Password Reset: `POST /api/v1/auth/password-reset/request|confirm`.
- Email Verification: `POST /api/v1/auth/email/send-verification|verify`.
- TOTP MFA (RFC 6238): `GET /api/v1/auth/totp/status`, `POST /api/v1/auth/totp/setup|enable|disable|challenge`. Required for `PLATFORM_ADMIN`.
- Privacy & GDPR: `GET /api/v1/me/export-data`, `POST /api/v1/me/delete-account`.

## Roles and authorization (WP-1.2)
- `role_assignments`: user_id, role, resource_type + resource_id (both null = global), expires_at. New users get a global PLAYER.
- `src/authz/policy.ts` maps each action to the roles allowed to do it. Unlisted action = denied (PLATFORM_ADMIN excepted, global only).
- Every `/api/v1` route must declare `config.access` (`public`, `authenticated`, or `{ action, resource?, hide? }`); registration throws otherwise.
  `hide: true` answers 404 instead of 403 so private resources don't reveal they exist.
- `GET /api/v1/me/permissions` returns `{ roles, actions }` for nav.
