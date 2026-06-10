/**
 * k6 performance scenario — full-season game logs
 *
 * Exercises POST /baseball-game-logs with no date filter so the stats
 * handler returns a full-season dataset (up to 162 MLB games per player).
 * This is the most data-intensive read path on the stats endpoint and the
 * most likely site of latency regressions under concurrent load.
 *
 * Usage:
 *   k6 run tests/performance/scenarios/game-logs.js
 *   K6_STATS_API_URL=https://api.legacy-fantasy.com k6 run tests/performance/scenarios/game-logs.js
 *
 * Two phases run back-to-back (total wall time ≈ 2 min):
 *   1. baseline  — 1 VU × 30 s   (single-user reference)
 *   2. load      — 10 VUs × 60 s (concurrent read load)
 *
 * Pass criteria (enforced by k6 thresholds):
 *   • p(95) response time < 2 000 ms
 *   • error rate < 1 %
 */

// eslint-disable-next-line @nx/enforce-module-boundaries -- k6 built-in, not an npm package
import http from 'k6/http';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { check, sleep } from 'k6';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const fullSeasonDuration = new Trend('full_season_request_duration_ms');

// Target URL — override via env var for CI / staging runs.
// __ENV is a k6 global; it is injected at runtime, not a Node.js process.env.
/* global __ENV, __VU */
const BASE_URL = __ENV.K6_STATS_API_URL || 'http://localhost:5000';
const ENDPOINT = `${BASE_URL}/baseball-game-logs`;

export const options = {
  scenarios: {
    full_season_baseline: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { scenario: 'baseline' },
    },
    full_season_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
      startTime: '35s',
      tags: { scenario: 'load' },
    },
  },
  thresholds: {
    // A full 162-game season fetch must complete within 2 s at p(95).
    http_req_duration: ['p(95)<2000'],
    // Error rate must remain below 1 %.
    errors: ['rate<0.01'],
    // Named trend mirrors the http threshold with a game-logs–specific label.
    full_season_request_duration_ms: ['p(95)<2000'],
  },
};

/**
 * Spread requests across multiple player IDs so a warmed backend cache
 * does not produce artificially low latency numbers.
 */
const PLAYER_IDS = [
  'mlb-shohei-ohtani',
  'mlb-mookie-betts',
  'mlb-freddie-freeman',
  'mlb-juan-soto',
  'mlb-aaron-judge',
];

export default function () {
  // Distribute VUs across player IDs in round-robin fashion.
  // __VU is 1-based, so subtract 1 before modulo.
  const playerId = PLAYER_IDS[(__VU - 1) % PLAYER_IDS.length];

  const payload = JSON.stringify({
    player_id: playerId,
    game_date: '', // no date filter → full-season (up to 162 games)
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'game_logs_full_season' },
  };

  const res = http.post(ENDPOINT, payload, params);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'latency < 2 s': (r) => r.timings.duration < 2000,
    'body is JSON object': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body === 'object' && body !== null;
      } catch (_e) {
        return false;
      }
    },
  });

  errorRate.add(!ok);
  fullSeasonDuration.add(res.timings.duration);

  // Simulate realistic think-time between successive fetches.
  sleep(1);
}
