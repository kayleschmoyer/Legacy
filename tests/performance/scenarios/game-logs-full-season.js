// LS-7474 — k6 perf scenario for `baseball-game-logs` paginated endpoint.
//
// Runs two flows against a player ID known to have a 162-game season + 1000+
// career, both paginated at 50 rows/page.
//
// SLOs (per spec):
//   - response P95 < 500ms
//   - response P99 < 1000ms
//
// Usage:
//   STATS_API_URL=https://stats.legacy-sports.example.com \
//   PLAYER_ID=mlb-9999 \
//   k6 run tests/performance/scenarios/game-logs-full-season.js
//
// The runner script in scripts/qa-runner.ps1 -Suite performance is expected to
// invoke this with the appropriate env vars. See tests/performance/README.md.

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL =
  __ENV.STATS_API_URL ||
  'https://stats.legacy-sports.example.com/baseball-game-logs';
const PLAYER_ID = __ENV.PLAYER_ID || 'mlb-9999';
const PAGE_SIZE = Number(__ENV.PAGE_SIZE || 50);
const SEASON_PAGES = Math.ceil(162 / PAGE_SIZE); // 4 pages for a full season
const CAREER_PAGES = Math.ceil(1000 / PAGE_SIZE); // 20 pages for a career view

export const options = {
  scenarios: {
    full_season: {
      executor: 'constant-vus',
      exec: 'fullSeason',
      vus: 5,
      duration: '30s',
      tags: { scenario: 'full_season' },
    },
    career_paginated: {
      executor: 'constant-vus',
      exec: 'careerPaginated',
      vus: 3,
      duration: '30s',
      startTime: '30s',
      tags: { scenario: 'career_paginated' },
    },
  },
  thresholds: {
    'http_req_duration{scenario:full_season}': ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{scenario:career_paginated}': ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

function postPage(offset) {
  return http.post(
    BASE_URL,
    JSON.stringify({
      player_id: PLAYER_ID,
      limit: PAGE_SIZE,
      offset,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

export function fullSeason() {
  for (let i = 0; i < SEASON_PAGES; i++) {
    const res = postPage(i * PAGE_SIZE);
    check(res, {
      'status 200': (r) => r.status === 200,
      'has rows': (r) => {
        try {
          const body = r.json();
          return (
            Array.isArray(body.rows) ||
            // Legacy shape: stat-major map
            (typeof body === 'object' && Object.keys(body).length > 0)
          );
        } catch (_) {
          return false;
        }
      },
    });
  }
}

export function careerPaginated() {
  for (let i = 0; i < CAREER_PAGES; i++) {
    const res = postPage(i * PAGE_SIZE);
    check(res, {
      'status 200': (r) => r.status === 200,
    });
  }
}
