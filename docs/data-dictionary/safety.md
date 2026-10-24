# consent, guardians, audit, trust and safety (WP-1.3, WP-1.4)

## Tables
- `guardian_relationships`: minor_id, guardian_email, guardian_id (set on acceptance), status `PENDING|ACTIVE|REVOKED`, verified_at, revoked_at.
- `consent_grants`: subject_id, kind `PUBLIC_PICKUP|PROFILE_DISCOVERY|MEDIA_USE|COMPETITION_PLAY`, granted_by, granted_at, revoked_at.
- `minor_emergency_contacts`: minor_id (unique), primary_contact_name, primary_contact_phone, primary_contact_relationship, secondary_contact_name, secondary_contact_phone, secondary_contact_relationship, medical_notes (allergies, inhaler, etc.), updated_by_id.
- `guardian_safety_settings`: (guardian_id, minor_id) unique, notify_on_pickup_join, notify_on_tournament_roster, notify_on_checkin, safety_lock_active. When safety lock is engaged, active tournament rosters and pickup participation are frozen immediately.
- `minor_activity_checkins`: minor_id, activity_type (`PICKUP_GAME|TOURNAMENT_MATCH|TEAM_PRACTICE`), activity_id, court_name, checked_in_at, parent_acknowledged_at, parent_acknowledged_by.
- `audit_log`: actor_id, action, resource_type, resource_id, reason, metadata (jsonb), created_at. **Append-only**: a trigger rejects UPDATE and DELETE.
- `user_blocks`: blocker_id + blocked_id (PK), kind `BLOCK|MUTE`.
- `moderation_cases`: target_type `USER|PICKUP_GAME|COURT`, target_id, status `OPEN|RESOLVED|DISMISSED`, resolved_by, resolution_note.
- `reports`: case_id, reporter_id, reason, note. One report per reporter per case.

## Rules
- A guardian is invited by the minor, by email. They accept from their **own signed-in adult account** whose email matches; there is no token to leak.
  An invitation not addressed to the caller answers 404.
- In production (`NODE_ENV=production`) acceptance also needs the guardian's email to be verified (`email_verified_at`, set by the verify-email flow). Dev and test run with this check off.
- A minor's consent counts only while the person who granted it is still an `ACTIVE` guardian of that minor, checked at read time. Revoking the guardian ends every consent they gave, immediately.
  A minor cannot grant consent for themselves but can withdraw it. Adults consent for themselves.
- Emergency Safety Lock (Spec §14.1, §23.4): When a parent activates the safety lock from the Guardian Portal (`/guardian`), `PUBLIC_PICKUP` and `COMPETITION_PLAY` consents are revoked atomically, instantly removing the minor from active tournament rosters and scheduled pickup runs.
- Pickup: an under-18 account needs `PUBLIC_PICKUP` to host or RSVP. Nothing changes for adults.
- Competitions: an under-18 player needs `COMPETITION_PLAY` to be on a competition roster; withdrawing it removes them from open rosters (see `rosters.md`).
- `BLOCK` hides both ways; `MUTE` hides only the muted user from the muter. Both remove people from pickup participant lists.
  A block between a host and a user makes that game read as 404 to the blocked or blocking user trying to RSVP.
- Reports never reveal case state to the reporter (always `202 {ok:true}`). Repeat reports on one open target fold into one case.
- Reading a case (it exposes reporter ids and notes) needs a `reason` of at least 8 characters and is written to `audit_log`. So does closing a case.
  `GET /api/v1/admin/audit` is `PLATFORM_ADMIN` only, needs a reason, and logs its own read.

## API
`GET|PUT|DELETE /api/v1/consents[/:kind]` (optional `subjectId` for a guardian acting for a ward) ·
`GET|POST /api/v1/guardians`, `POST /api/v1/guardians/:id/accept`, `DELETE /api/v1/guardians/:id` ·
`GET /api/v1/guardian/dashboard` (full family overview with active wards, consents, upcoming activities, and safety lock status) ·
`GET|PUT /api/v1/guardian/wards/:minorId/emergency` (view/update emergency contacts & medical notes) ·
`PUT /api/v1/guardian/wards/:minorId/safety-settings` (notification toggles and emergency safety lock trigger) ·
`POST /api/v1/guardian/wards/:minorId/consents` & `DELETE /api/v1/guardian/wards/:minorId/consents/:kind` ·
`POST /api/v1/guardian/checkins/:checkinId/acknowledge` (parent safe arrival confirmation) ·
`GET /api/v1/blocks`, `PUT|DELETE /api/v1/blocks/:userId` · `POST /api/v1/reports` ·
`GET /api/v1/moderation/cases[/:id]`, `POST /api/v1/moderation/cases/:id/resolve` · `GET /api/v1/admin/audit`.

## Not built
Guardian invitation emails (the guardian finds requests in their own account), a moderator UI, report/block buttons in the web app, audit entries for events outside this module.
