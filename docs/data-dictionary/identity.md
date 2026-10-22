# identity

- `users`: id (uuid), email (unique, lowercased), password_hash (argon2id), display_name, date_of_birth, is_minor, email_verified_at, created_at.
- `sessions`: token_hash (sha256 of opaque cookie token, PK), user_id, expires_at (14 days), created_at.

API: `POST /api/v1/auth/signup|login|logout`, `GET /api/v1/me`. Auth endpoints are rate-limited (10/min/IP).
Not yet built: email verification, password reset, admin TOTP.
