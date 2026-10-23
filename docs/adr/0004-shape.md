# ADR-0004: System shape

Status: Accepted (Modulith enforcement superseded by ADR-0011)

## Decision
Modular monolith in services/core-api, boundaries enforced by Spring Modulith; the event publication registry is the transactional outbox. Python workers are separate processes.
