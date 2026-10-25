import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

/**
 * COURT IQ — Live Match SSE Stream Viewer Load Test (Spec §22, Plan §5)
 * Target: 1,000 concurrent SSE viewers across 20 concurrent live matches.
 * Protocol: Server-Sent Events (/api/v1/streams/matches/:matchId).
 */

export const options = {
  scenarios: {
    sse_viewers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 200 },   // Warm-up ramp
        { duration: "1m", target: 1000 },   // Scale to target 1,000 concurrent viewers
        { duration: "2m", target: 1000 },   // Sustain target peak
        { duration: "30s", target: 0 },      // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<150"],        // 95% of connections establish in <150ms
    http_req_failed: ["rate<0.001"],         // <0.1% error rate
    sse_connection_success: ["rate>0.999"],  // 99.9% connection success
  },
};

const sseConnectionSuccess = new Rate("sse_connection_success");
const sseStreamDuration = new Trend("sse_stream_duration");
const sseEventsReceived = new Counter("sse_events_received");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const MATCH_COUNT = 20;

export default function () {
  // Distribute virtual users across 20 synthetic live match IDs
  const matchIndex = (__VU % MATCH_COUNT) + 1;
  const matchId = `00000000-0000-0000-0000-${String(matchIndex).padStart(12, "0")}`;
  const streamUrl = `${BASE_URL}/api/v1/streams/matches/${matchId}`;

  const params = {
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    timeout: "60s",
  };

  const startTime = Date.now();
  const res = http.get(streamUrl, params);

  const duration = Date.now() - startTime;
  sseStreamDuration.add(duration);

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "content-type is event-stream": (r) =>
      r.headers["Content-Type"] && r.headers["Content-Type"].includes("text/event-stream"),
  });

  sseConnectionSuccess.add(success);
  if (success) {
    sseEventsReceived.add(1);
  }

  // Viewers listen to the stream for a random interval before potential reconnect
  sleep(Math.random() * 5 + 5);
}
