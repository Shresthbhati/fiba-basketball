import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

/**
 * COURT IQ — Live Scorebook Match Event Ingestion Load Test (Spec §16, Plan §5)
 * Target: 50 events/second sustained ingest across concurrent live courts.
 * Protocol: POST /api/v1/matches/:id/events (Idempotency-Key & version optimistic concurrency).
 */

export const options = {
  scenarios: {
    constant_event_ingest: {
      executor: "constant-arrival-rate",
      rate: 50,                         // 50 events per second
      timeUnit: "1s",
      duration: "3m",                   // 3 minutes continuous ingest
      preAllocatedVUs: 50,
      maxVUs: 150,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<50"],    // p95 latency under 50ms for live scoring
    http_req_failed: ["rate<0.0001"],   // Zero tolerance for dropped scorebook events
    event_ingest_success: ["rate>0.9999"],
  },
};

const eventIngestSuccess = new Rate("event_ingest_success");
const eventProcessingLatency = new Trend("event_processing_latency");
const totalEventsIngested = new Counter("total_events_ingested");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const MATCH_COUNT = 20;

const EVENT_TYPES = [
  "FIELD_GOAL_MADE",
  "FIELD_GOAL_MISSED",
  "THREE_POINT_MADE",
  "THREE_POINT_MISSED",
  "FREE_THROW_MADE",
  "REBOUND_OFFENSIVE",
  "REBOUND_DEFENSIVE",
  "ASSIST",
  "STEAL",
  "TURNOVER",
  "FOUL_PERSONAL",
  "SUBSTITUTION_IN",
];

export default function () {
  const matchIndex = (__VU % MATCH_COUNT) + 1;
  const matchId = `00000000-0000-0000-0000-${String(matchIndex).padStart(12, "0")}`;
  const url = `${BASE_URL}/api/v1/matches/${matchId}/events`;

  const eventUuid = `evt-${__VU}-${__ITER}-${Date.now()}`;
  const randomType = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];

  const payload = JSON.stringify({
    clientEventId: eventUuid,
    eventType: randomType,
    period: 2,
    gameClockSeconds: 480 - (__ITER % 480),
    points: randomType === "THREE_POINT_MADE" ? 3 : randomType === "FIELD_GOAL_MADE" ? 2 : randomType === "FREE_THROW_MADE" ? 1 : 0,
    teamId: matchIndex % 2 === 0 ? "team-home" : "team-away",
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": eventUuid,
    },
    timeout: "5s",
  };

  const startTime = Date.now();
  const res = http.post(url, payload, params);
  const latency = Date.now() - startTime;

  eventProcessingLatency.add(latency);

  const success = check(res, {
    "status is 200 or 201": (r) => r.status === 200 || r.status === 201,
    "has x-request-id": (r) => r.headers["X-Request-Id"] !== undefined,
  });

  eventIngestSuccess.add(success);
  if (success) {
    totalEventsIngested.add(1);
  }
}
