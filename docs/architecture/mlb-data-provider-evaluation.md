# MLB Data Provider Evaluation

**Spike:** LS-1869  
**Status:** Recommendation made — pricing confirmation pending  
**Date:** 2026-03-31

## Context

The free MLB Stats API (`statsapi.mlb.com`) is restricted to non-commercial use. Legacy Sports
operates commercially with premium subscriptions, so production requires a licensed data
redistribution provider. Player statistics are public domain per _CBC Distribution v. MLBAM_
(8th Cir. 2007, cert denied 2008), but the API terms restrict commercial use of MLB's own API.

## Candidate Evaluation

| Provider             | Est. Cost                              | Live Data        | Fantasy Use | API Quality                                   | Notes                                               |
| -------------------- | -------------------------------------- | ---------------- | ----------- | --------------------------------------------- | --------------------------------------------------- |
| **BALLDONTLIE**      | Free tier; paid tiers TBD              | Yes (paid)       | Allowed     | REST + TypeScript types                       | Freemium — free tier limited, paid pricing unlisted |
| **Rolling Insights** | ~$100/mo post-game; ~$400/mo real-time | Yes              | Allowed     | REST; good documentation                      | Month-to-month, no contract, unlimited API calls    |
| **SportsDataIO**     | Contact sales                          | Yes              | Allowed     | REST + SDKs; Discovery Lab (last season free) | Enterprise; likely $500+/mo live                    |
| **MySportsFeeds**    | Contact sales                          | Near-realtime    | Allowed     | REST; developer-friendly                      | Flexible terms; good for fantasy platforms          |
| **Sportradar**       | ~$2,000+/mo                            | Yes (WebSockets) | Allowed     | Official MLB partner; enterprise SDKs         | Overkill for current scale                          |

## Scoring Matrix

| Criterion                   | Weight | BALLDONTLIE          | Rolling Insights | SportsDataIO     | MySportsFeeds    | Sportradar          |
| --------------------------- | ------ | -------------------- | ---------------- | ---------------- | ---------------- | ------------------- |
| Cost fit (current budget)   | 30%    | ⚠️ Unknown paid tier | ✅ Clear pricing | ❌ Likely high   | ⚠️ Unknown       | ❌ ~$2k+/mo         |
| Live score coverage         | 25%    | ✅ Yes (paid)        | ✅ Yes           | ✅ Yes           | ✅ Near-realtime | ✅ Yes (WebSockets) |
| Player stat coverage        | 20%    | ✅ Full              | ✅ Full          | ✅ Full          | ✅ Full          | ✅ Full             |
| API / TypeScript ergonomics | 15%    | ✅ Typed SDK         | ✅ Good REST     | ✅ SDKs          | ✅ Good          | ✅ Enterprise SDKs  |
| Commercial terms clarity    | 10%    | ✅ Explicit          | ✅ Explicit      | ⚠️ Contact sales | ✅ Explicit      | ✅ Explicit         |

## Recommendation

**Primary: Rolling Insights** — clearest pricing, month-to-month flexibility, unlimited calls,
real-time live scores, and commercially licensed for fantasy sports. At $400/mo real-time, the
cost is proportionate to current ARR and avoids long-term commitment risk.

**Fallback: BALLDONTLIE** — if Rolling Insights pricing proves prohibitive, BALLDONTLIE's paid
tier is worth evaluating. Its typed TypeScript SDK would reduce implementation effort.

**Not recommended for current scale:** Sportradar (~$2k+/mo enterprise), SportsDataIO (contact
sales, likely enterprise pricing).

## Provider Interface Mapping

The `MlbDataProvider` interface (to be defined in the planned `lib/mlb-client` package — see
LS-1864) needs these methods. Both top candidates cover them:

| Interface method                   | Rolling Insights endpoint                 | BALLDONTLIE endpoint                       |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------ |
| `getSchedule(date)`                | `GET /mlb/games?date=YYYY-MM-DD`          | `GET /v1/games?date=YYYY-MM-DD`            |
| `getLiveScoreboard(date)`          | `GET /mlb/games/live`                     | Paid live endpoint                         |
| `getPlayerStats(playerId, season)` | `GET /mlb/players/{id}/stats?season=YYYY` | `GET /v1/stats?player_id={id}&season=YYYY` |
| `getRoster(teamId, season)`        | `GET /mlb/teams/{id}/roster?season=YYYY`  | `GET /v1/players?team_id={id}`             |

## Action Items

- [ ] Contact Rolling Insights for a commercial quote: `sales@rollinginsights.com`
- [ ] Contact BALLDONTLIE for paid tier pricing: `mlb.balldontlie.io/pricing` or support channel
- [ ] Once pricing confirmed, update `MLB_DATA_PROVIDER` Terraform variable (LS-1863) and
      provider adapter in `lib/mlb-client` (LS-1864)
- [ ] Update this document with final selected provider and contract terms

## Legal Reference

- _CBC Distribution and Marketing, Inc. v. Major League Baseball Advanced Media, L.P._,
  505 F.3d 818 (8th Cir. 2007), cert. denied, 553 U.S. 1090 (2008)
- Holds that player names and statistics in publicly available games are in the public domain
  under the First Amendment — fantasy sports use is protected
- Does **not** exempt scraping MLB's own proprietary API; a redistribution license is still
  required for commercial use of MLB-branded data feeds
