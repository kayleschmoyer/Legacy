# Worked Example — LS-4295 "Stuck at Pick 10"

> Loaded from [cloudwatch-archaeology SKILL](../SKILL.md).

## Worked Example — LS-4295: "Stuck at Pick 10"

### What the test stdout said

```
+251.4s  miss #10  picksAutoMade=n/a
+263.1s  miss #11  picksAutoMade=n/a
+274.8s  miss #12  picksAutoMade=n/a
TIMEOUT: draft stuck at pick 10 after 300s
```

The test's local `pickCount` read 10 for the entire observation window. The obvious hypothesis: the WebSocket update stopped delivering pick events, or pick 10 itself was failing on the server.

### What CloudWatch revealed

Filtering `/aws/lambda/legacy-sports-dev-game-selection` for `'"autoProcessDraftPicks"'` over the test window:

```json
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 1,  "teamId": "..." }
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 2,  "teamId": "..." }
...
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 13, "teamId": "..." }
{ "message": "No expired drafts found", "checkedAt": "..." }   ← cron stopped here
```

The server had **actually advanced picks 1–13** over 3.5 minutes. The test's `pickCount` was out of sync due to a `wasAccepted` race condition in the client — the local counter never updated past 10.

### What the opaque `n/a` actually meant

Filtering `/aws/lambda/legacy-sports-dev-graphql` for `'"member of this league"'`:

```json
{
  "error": "ForbiddenError: You are not a member of this league",
  "resolver": "nudgeDraft",
  "leagueId": "...",
  "userId": "..."
}
```

Every `picksAutoMade=n/a` line in the test was a client nudge returning `ForbiddenError`. The test printed `n/a` because the nudge resolver returned an error rather than a pick count — but the test reporter only logged the top-level shape, not the error payload. PR [#3772](https://github.com/bkrupa/legacy-sports/pull/3772) surfaced this by adding explicit error logging to the nudge response path.

### Actual queries used

```bash
# Step 1 — establish the failure window from the Playwright report
# startTime from results.json: 2024-04-25T14:32:10.000Z → 1714054330000
# duration: 310s → end: 1714054640000

# Step 2 — list Lambda log groups
MSYS_NO_PATHCONV=1 aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/legacy-sports"

# Step 3a — find cron activity
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-dev-game-selection" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"autoProcessDraftPicks"'

# Step 3b — find the actual error behind picksAutoMade=n/a
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-dev-graphql" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"member of this league"'

# Step 4 — cross-reference: was the right userId in the JWT?
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-dev-oauth-proxy" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"leagueId\":\"<uuid>\""'
```

**Key lesson**: the "stuck at pick 10" narrative was entirely a client-side sync artifact. The server had long since moved on. Two log queries resolved in 5 minutes what a UI/WebSocket debugging chase would have taken 2+ hours to find.
