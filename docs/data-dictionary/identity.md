# identity

- `users`: id (uuid), email (unique, lowercased), password_hash (argon2id), display_name, date_of_birth, is_minor, email_verified_at, email_notifications, totp_secret, totp_enabled, totp_recovery_codes (hashed), totp_verified_at, is_erased (boolean), erased_at (timestamp), created_at.
- `sessions`: token_hash (sha256 of opaque cookie token, PK), user_id, is_mfa_verified, expires_at (14 days), created_at.
- `data_export_requests`: id (uuid), user_id (cascade delete), status (READY | PENDING), payload (machine-readable JSON archive), checksum_sha256, expires_at (7 days), created_at.
- `account_erasure_requests`: id (uuid), user_id, original_email_hash (sha256), status (COMPLETED), reason, erased_at, created_at.

API:
- Core Auth: `POST /api/v1/auth/signup|login|logout`, `GET /api/v1/me`. Auth endpoints are rate-limited (10/min/IP).
- Password Reset: `POST /api/v1/auth/password-reset/request|confirm`.
- Email Verification: `POST /api/v1/auth/email/send-verification|verify`.
- TOTP MFA (RFC 6238): `GET /api/v1/auth/totp/status`, `POST /api/v1/auth/totp/setup|enable|disable|challenge`. Required for `PLATFORM_ADMIN`.
- Privacy, Data Retention & Right to Erasure (Spec §1.4, §24.4, WP-1.4):
  - `GET /api/v1/privacy/status`: Privacy governance and data retention status.
  - `POST /api/v1/privacy/export`: Generates machine-readable personal data archive with SHA-256 integrity hash (GDPR Art. 15/20).
  - `GET /api/v1/privacy/export/latest`: Downloads latest generated JSON archive.
  - `POST /api/v1/privacy/erasure`: Password-verified irreversible erasure; invalidates sessions, scrubs sensitive health records, anonymizes profile to `[Former Member]`, and preserves FIBA official scorebooks under legal/historical integrity exemptions (GDPR Art. 17).

## Roles and authorization (WP-1.2)
- `role_assignments`: user_id, role, resource_type + resource_id (both null = global), expires_at. New users get a global PLAYER.
- `src/authz/policy.ts` maps each action to the roles allowed to do it. Unlisted action = denied (PLATFORM_ADMIN excepted, global only).
- Every `/api/v1` route must declare `config.access` (`public`, `authenticated`, or `{ action, resource?, hide? }`); registration throws otherwise.
  `hide: true` answers 404 instead of 403 so private resources don't reveal they exist.
- `GET /api/v1/me/permissions` returns `{ roles, actions }` for nav.
