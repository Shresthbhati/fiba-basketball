# COURT IQ — Performance & Load Testing Suite

This directory contains automated k6 performance and load benchmarks specified in **Implementation Plan §5** and **Master Spec §22, §25**.

## Test Scenarios

### 1. `k6-sse-load.js`: Real-Time SSE Viewer Scalability
- **Target**: 1,000 concurrent Server-Sent Events (SSE) connections fan-out across 20 concurrent live matches.
- **SLA**:
  - Connection establishment: $p_{95} < 150\text{ ms}$.
  - Error rate: $< 0.1\%$.
  - Reconnection recovery: Graceful without socket exhaustion.

### 2. `k6-event-ingest.js`: Scorebook Event Ingestion Throughput
- **Target**: Sustained 50 events/second ingest rate with concurrent database transactional state projection.
- **SLA**:
  - Request processing latency: $p_{95} < 50\text{ ms}$.
  - Dropped events: $0\%$.
  - Strict idempotent deduplication using `Idempotency-Key` headers.

---

## Running Benchmarks

### Prerequisites
Install [k6](https://k6.io/docs/get-started/installation/):
```bash
# macOS
brew install k6

# Windows (winget)
winget install k6 --source winget

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Running Locally Against Dev Stack
Ensure the API service is running (`pnpm --filter @courtiq/api dev` or `docker compose up api`):

```bash
# 1. Run SSE Stream Viewer Benchmark (1,000 concurrent viewers)
k6 run tests/performance/k6-sse-load.js

# 2. Run High-Throughput Event Ingestion Benchmark (50 events/sec)
k6 run tests/performance/k6-event-ingest.js

# 3. Custom Target URL
BASE_URL="http://api.courtiq.test:3001" k6 run tests/performance/k6-sse-load.js
```

---

## Benchmark Audit Results
Official benchmark measurements and capacity limits are documented in [`docs/operations/benchmarks.md`](../../docs/operations/benchmarks.md).
