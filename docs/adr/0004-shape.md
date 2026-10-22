# ADR-0004: System shape

Status: Accepted

## Decision
Modular monolith in services/core-api, boundaries enforced by Spring Modulith; the event publication registry is the transactional outbox. Python workers are separate processes.
