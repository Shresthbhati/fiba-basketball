# ADR-0014: Game film storage (first slice)

Status: Accepted (provisional; refines ADR-0005)

## Decision
Video bytes live outside the database behind a `MediaStorage` interface (`put`, `read` with byte range, `size`, `remove`).
The first implementation writes to a directory (`MEDIA_DIR`, a persistent volume in production). The API streams uploads
(never buffered), enforces a size limit while streaming (`MAX_VIDEO_MB`, default 1024), accepts only mp4/webm/mov, and
serves downloads itself with `Range` support so the browser can seek. Only the storage key is stored in Postgres.

## Why not presigned S3 URLs yet
ADR-0005 still stands as the target. Presigned URLs would let the browser talk to storage directly and take video traffic
off the API, but need an S3/MinIO service we cannot run or test in the current environment. Serving through the API keeps
the access rule in one place: a request is allowed only for a member of the game's team, otherwise 404.

## Consequences
- One API instance per volume (or a shared volume) until the S3 implementation exists.
- Large uploads tie up the API process; fine for a few teams, not for scale.
- No transcoding, thumbnails or virus scanning. Files are served with the type the uploader declared (mp4/webm/mov only,
  `nosniff` set by helmet).
- Under-18 players can only join a team after a guardian grants `MEDIA_USE` consent.
