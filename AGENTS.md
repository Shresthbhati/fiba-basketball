# AGENTS.md — operating rules for COURT IQ coding agents

Product truth: `docs/product-vision/court-iq-master-spec.md`. Plan and WP catalogue: `docs/implementation-plan.md`.
Locked decisions: `docs/adr/`. Change a decision only through a new ADR, never silently.

## Workflow
- Pick a WP whose dependencies are merged. One WP per branch/PR; PR title `[WP-x.y] …`.
- Read the cited spec section and the ADRs before coding.
- Every WP ships: Flyway migration (if schema), regenerated OpenAPI, authZ checks plus negative authZ tests
  (other user / other team / revoked grant → 404), unit and integration tests, loading/empty/error/offline UI
  states for any screen, and an update to `docs/data-dictionary/<module>.md`.
- Definition of Done: CI green and each WP acceptance criterion demonstrated by an automated test
  (Playwright for UI).

## Never
- Hardcode secrets; use seed/demo data outside the dev profile.
- Display AI output without provenance + confidence + a correction path.
- Expose exact user location.
- Ship a control that does nothing (use feature flags `courtiq.features.*`).
- Output injury probability anywhere (ADR-009).

## Conventions
- Java base package `com.courtiq`; npm scope `@courtiq`. Shared kernel in `com.courtiq.shared`:
  UUIDv7 IDs, `Auditable`, `ResourceRef`, `Visibility`, `VerificationStatus`,
  `SourceType {OFFICIAL, SENSOR, CV_ESTIMATE, COACH, SELF_REPORTED, MODEL_INFERENCE}`.
- Modules communicate only via another module's public `*Api` interface or published events (Spring Modulith verifies).
- Every controller method calls `AuthorizationService.can(...)` (ArchUnit-enforced); unauthorized private resources return 404.
- REST under `/api/v1`, RFC 9457 problem+json, cursor pagination, `Idempotency-Key` on retryable POSTs, `If-Match` for concurrency.
- Flyway only (`V{n}__{module}_{desc}.sql`); no `ddl-auto`.
