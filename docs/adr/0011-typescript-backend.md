# ADR-0011: TypeScript backend (supersedes ADR-0002 and the Modulith part of ADR-0004)

Status: Accepted (owner decision: no Java)

## Decision
- One language for web and API: TypeScript (strict), Node 22, pnpm workspaces.
- API service: `services/api` — Fastify 5 + zod validation; Postgres/PostGIS access via a SQL-first migration tool and a typed query layer (chosen in the first data WP).
- Still a modular monolith: one folder per module under `services/api/src/<module>/`, cross-module access only through that module's `index.ts` exports (enforced with an ESLint import-boundary rule, added when the second module lands).
- Python workers (vision/media) unchanged.
- Java-specific rules in the plan translate as: Flyway → SQL migrations; Spring Security/Session → server-side sessions in Redis; ArchUnit/Modulith checks → ESLint boundary + route-level authorization tests; springdoc → OpenAPI generated from zod schemas.
- All other ADRs (0001, 0003, 0005–0010) stand.
