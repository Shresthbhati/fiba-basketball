# Notifications

`notifications`: one row per user per event. Private to `user_id` (no one else can list or mark them read). Titles never name other users.

| kind | Created when | Recipients |
|---|---|---|
| `GAME_CANCELLED` | host cancels a game, or stops a weekly series (one per upcoming game) | confirmed and waitlisted players, not the host, not people who already left |
| `WAITLIST_PROMOTED` | someone cancels and the first waitlisted player gets the spot | that player |
| `ADDED_TO_TEAM` | a coach adds someone to a team | that person |

Delivery: a count in the navigation (refreshed every minute and on navigation) and the /notifications page, plus email for the
two time-sensitive kinds (`GAME_CANCELLED`, `WAITLIST_PROMOTED`). There is no push or SMS. Creating a notification is best effort: if it fails, the action that caused it still succeeds.

## Email
The API process runs `deliverEmails` every minute. A notification is emailed at most once: each row is claimed (`email_state`
null → `SENDING`) before sending, then `SENT`. It is skipped (`SKIPPED`) if it was already read, the person turned emails off
(`users.email_notifications`, switch on /notifications), the account is under 18 (never emailed), or it is over a day old. It waits
a minute first so people who are in the app are not emailed. A failed send is retried, and after 3 attempts marked `FAILED`.
A process crash between claiming and sending drops that one email rather than risking a duplicate.
The email links to the game and to /notifications where the switch is; there is no one-click unsubscribe link (needs sign-in).

Not built: per-kind preferences, digest emails, deleting notifications, notifying about game changes other than cancellation, retention/cleanup.
