# Notifications

`notifications`: one row per user per event. Private to `user_id` (no one else can list or mark them read). Titles never name other users.

| kind | Created when | Recipients |
|---|---|---|
| `GAME_CANCELLED` | host cancels a game, or stops a weekly series (one per upcoming game) | confirmed and waitlisted players, not the host, not people who already left |
| `WAITLIST_PROMOTED` | someone cancels and the first waitlisted player gets the spot | that player |
| `ADDED_TO_TEAM` | a coach adds someone to a team | that person |

Delivery is in-app only: a count in the navigation (refreshed every minute and on navigation) and the /notifications page. There is no
email, push or SMS yet. Creating a notification is best effort: if it fails, the action that caused it still succeeds.
Not built: notification preferences, deleting notifications, notifying about game changes other than cancellation, retention/cleanup.
