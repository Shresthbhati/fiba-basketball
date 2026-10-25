# Notifications

`notifications`: one row per user per event. Private to `user_id` (no one else can list or mark them read). Titles never name other users.

| kind | Created when | Recipients |
|---|---|---|
| `GAME_CANCELLED` | host cancels a game, or stops a weekly series (one per upcoming game) | confirmed and waitlisted players, not the host, not people who already left |
| `WAITLIST_PROMOTED` | someone cancels and the first waitlisted player gets the spot | that player |
| `ADDED_TO_TEAM` | a coach adds someone to a team | that person |
| `GAME_INVITE` | player or host invites user to a pickup run or tournament match | invited player |
| `COURT_ALERT` | major condition, lighting, or activity report for favorited/nearby court | subscribed players |
| `TEAM_ANNOUNCEMENT` | official team roster or schedule change published | team squad members |

Delivery: real-time in-app badges, email delivery queue, and Web Push VAPID notifications with quiet hours and daily volume caps.

## Notification Preferences, Quiet Hours & Delivery Volume Caps (WP-5.1, Master Spec §11.4)
- `notification_preferences`:
  - `user_id`: UUIDv7 PK references `users.id` cascade.
  - Channels: `web_push_enabled`, `email_enabled`.
  - Categories: `game_invites`, `court_alerts`, `team_announcements`.
  - Quiet Hours: `quiet_hours_enabled`, `quiet_hours_start` (e.g. "22:00"), `quiet_hours_end` (e.g. "08:00"), `quiet_hours_timezone` (e.g. "UTC"). Cross-midnight evaluation suppresses non-essential pushes while allowing urgent in-app events.
  - Daily Cap: `daily_cap` (integer, default 10). Restricts rolling 24-hour notifications to prevent alert fatigue.
- `push_subscriptions`:
  - Stores RFC 8291/8292 browser subscriptions (`endpoint`, `p256dh`, `auth`, `user_agent`).
- `notification_delivery_logs`:
  - Append-only log of deliveries (`kind`, `channel`, `status` [DELIVERED | SUPPRESSED], `suppression_reason` [QUIET_HOURS | DAILY_CAP_EXCEEDED | OPTED_OUT], `sent_at`).
- API Endpoints:
  - `GET /api/v1/notifications/vapid-public-key`: public VAPID key for browser service worker registration.
  - `GET /api/v1/notifications/preferences`: user preferences, 24-hour volume counter, and quiet hours state.
  - `PUT /api/v1/notifications/preferences`: updates quiet hours, categories, and daily cap.
  - `GET|POST|DELETE /api/v1/notifications/push-subscriptions`: browser push subscription management.
  - `POST /api/v1/notifications/test-dispatch`: tests quiet hours and rate capping logic with delivery receipt.
