# Performance test scaffold

k6 perf scenarios live under `scenarios/`. CLAUDE.md references
`scripts/qa-runner.ps1 -Suite performance` as the orchestrator; this directory
is the input.

## Running locally

```powershell
# Install k6 once
winget install k6 --source winget

# Run a single scenario
k6 run tests/performance/scenarios/game-logs-full-season.js

# Override the target endpoint + player id
$env:STATS_API_URL = "https://stats.staging.legacy-sports.example.com/baseball-game-logs"
$env:PLAYER_ID     = "mlb-9999"
k6 run tests/performance/scenarios/game-logs-full-season.js
```

## Scenarios

| File                                 | Purpose                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `scenarios/game-logs-full-season.js` | LS-7474 — paginated full-season + career fetches against `baseball-game-logs`. P95 < 500ms, P99 < 1s. |

## SLO conventions

- `http_req_duration` P95 / P99 thresholds per scenario.
- `http_req_failed` rate < 1%.
- Tag each scenario so thresholds can be scoped (`{scenario:full_season}`).
