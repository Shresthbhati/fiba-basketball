# ADR-0013: Nearby search via bounding box + haversine (amends ADR-0008)

Status: Accepted (revisit when court count passes ~50k)

- Embedded Postgres used for tests has no PostGIS, and v1 volumes are small. Courts store plain `lat`/`lng`; search uses an indexed latitude/longitude bounding box, then exact haversine distance in code.
- Same rules as ADR-0008: radius capped at 50 km, max 100 results, distances rounded to 100 m, callers search from a point they choose and we never store their location.
- Migration path: add a `geography(Point,4326)` column + GiST index and swap the query; the API does not change.
