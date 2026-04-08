# Matchup System — League Member Guide

**Audience**: Team owners and league members
**Last Updated**: April 7, 2026

This guide walks through how matchups work from a team owner's perspective —
what you'll see each week, how scoring is computed, how to set lineups, and
how playoffs work. If you run the league, see
[Commissioner Matchup Management](commissioner-matchup-management.md) instead.
For technical details, see
[Matchup System Architecture](../architecture/matchup-system.md).

---

## What is a matchup?

A **matchup** is a head-to-head competition between two teams in your league
for one **week**. Each week, the league's schedule pairs you up with another
team. Whichever team scores the most fantasy points wins the matchup. Wins
and losses across the season determine your standing and your playoff seed.

A matchup goes through three states:

| Status        | What it means                                                         |
| ------------- | --------------------------------------------------------------------- |
| `scheduled`   | The week hasn't started yet. You can edit lineups and pick players.   |
| `in_progress` | Games are being played. Scores update as MLB data is loaded.          |
| `completed`   | The week is over. The winner is locked and the recap becomes visible. |

> Admins/system can also set status to `cancelled` (rare edge case).

You'll also see a **stats loading** indicator while real game data is being
fetched (`loading`, `queued`, `failed`, etc.). This is just the background
job — your matchup is still safe.

---

## Reading your matchup card

Each matchup shows the two teams, their current scores, and the number of
games each side has selected for the week. From the card you can drill into:

- **Roster comparison** — both lineups side by side.
- **Scoreboard** — live tile for each game with inning-by-inning updates.
- **Win probability** — model-driven estimate of who's most likely to take it.
- **Recap** — a short auto-generated narrative once the matchup is complete.

The recap is generated automatically from the matchup results by a
deterministic, template-driven narrative generator (`lib/narrative/`). It
classifies your matchup as a **blowout** (margin ≥ 20), **close** (margin
≤ 5), or **normal**, then writes a 2–3 sentence summary plus highlight
bullets for the standout players. The same matchup always produces the
same recap.

---

## Setting your lineup

Your roster snapshot for each matchup is created when the matchup is
scheduled. From the lineup editor you can:

- **Move a player into a position slot** — drag-and-drop or use the picker.
  This sets the player's `position_id` for that matchup only.
- **Swap two players** — exchange positions between two roster slots in one
  step.
- **Pre-set future weeks** — any edit you make to a future week's lineup is
  marked as **manually edited** and will not be overwritten by automatic
  roster propagation when team membership changes.

> **Lineup lock**: Lineups lock when the first selected game starts.
> The bot posts hourly Discord reminders before lineup locks if your league
> has Discord enabled.

### Selecting games

Each player gets a fixed number of **game days** for the week (configured
by the commissioner — typically 5 for hitters, 1 for starting pitchers).
The system selects games for you automatically each night via the
`autoSelectGames` job, but the commissioner can adjust manually.

Starting pitchers are sometimes **probabilistically skipped** for a given
day. This is shown as `spSkipped` and reflects that real-world starting
rotations don't pitch every day.

---

## How scoring works

Scores are computed from real MLB box scores using your league's **scoring
profile**. Each profile assigns a multiplier to each tracked stat — HR, RBI,
hits, stolen bases, strikeouts, innings pitched, etc.

Some important rules:

- **Per-game scores are not stored.** The system always recomputes from raw
  stats. This means if your commissioner tweaks the scoring profile mid-
  season, historical scores are recomputed automatically and consistently.
- **Profiles are versioned.** Every change is recorded in the audit log
  with the previous and new multipliers and the reason given.
- **Team totals are recalculated and persisted as stats load.** The system
  does not store separate per-game scores in the matchups table; instead, it
  keeps the current matchup totals up to date, and the final completed-week
  value is what matters.

If a stat doesn't show up in the standings, it probably isn't in your
league's profile — talk to your commissioner.

---

## Standings and analytics

The league standings page is driven by the `getLeagueStandings` query and
shows, for each team:

- Wins, losses, ties, win percentage
- Points for and points against
- Average points scored per matchup
- Optional rank and division
- Power ranking (a model-driven blend of recent form and point
  differential)

Other useful views:

- **Head-to-head record** — your full history vs any opponent.
- **Recent matchups** — your last N completed matchups.
- **Season summary** — your full year of results in one place.
- **Playoff race** — your projected playoff probability and "magic number".

---

## Trash talk and chat

Each matchup has a built-in chat thread where both teams can post text or
GIFs, react with emoji, reply to messages, and pin highlights. The
moderation system flags profanity automatically. If someone is harassing
you, you can block them at the **matchup**, **league**, or **global** scope.
Reports go to your commissioner (or the platform mods, for global blocks).

Messages can be **soft-deleted** by the author or commissioner — the row
sticks around for moderation history but is no longer rendered.

---

## Notifications

Three Discord notifications fire automatically if your league has Discord
configured:

| When          | What you get                                          |
| ------------- | ----------------------------------------------------- |
| Every 4 hours | Live score update; close matchups are flagged         |
| Hourly        | Lineup-lock reminder before each game-day cutoff      |
| End of week   | Full weekly recap with winners, losers, and headlines |

Mobile push notifications are configured separately under your account
preferences.

---

## Playoffs

When the regular season ends, your league enters the **playoff bracket**.
The commissioner picks a format:

- **4-team** — top 4 seeds, two semifinals, one final
- **6-team** — top 6 seeds, with two wildcard rounds (3v6, 4v5), then
  semifinals, then a final
- **8-team** — full quarterfinal bracket

Playoff matchups can be configured to span **multiple weeks** so a single
playoff series feels like a real series rather than a single game.

The winner is recorded in the **champion trophies** table and shows up on
your team profile and the league's "trophy room."

### Tiebreakers

If a playoff matchup ends in a tie, the league's tiebreaker rules apply.
Each league configures up to three methods (primary, secondary, tertiary):

| Method                | What it does                                    |
| --------------------- | ----------------------------------------------- |
| `highest_category`    | Best total in a single configured stat category |
| `total_season_points` | Most regular-season points scored               |
| `head_to_head_record` | Direct H2H win count vs the tied opponent       |
| `random`              | Coin flip                                       |
| `co_champion`         | Both teams advance / share the title            |

Every tiebreaker resolution is logged with the method used and whether the
commissioner overrode the result. If your commissioner has
`allow_commissioner_override` enabled, they can manually pick the winner.

---

## Frequently asked questions

**My score went up after the week ended — why?**
The stats lambda is async; box scores can take several hours to fully load.
Watch the `statsLoadingStatus` indicator. Once it reads `completed`, your
score is final.

**My pitcher's start was skipped — what happened?**
The starting-pitcher skip flag is probabilistic and reflects real rotations.
A starter can't pitch every day, so the system models off days. You can
see this on the matchup detail view.

**Can I edit lineups after the week starts?**
Yes, until the first selected game of the day starts. Once that game has
locked, the lineup for that day is frozen.

**Why are some of my future-week edits preserved and others overwritten?**
Edits you make manually in the lineup editor are flagged as
`manually_edited` and protected. Anything propagated from your team roster
without an explicit edit can be overwritten when the roster propagation job
re-runs.

**How are my projections computed?**
The dual projection system shows both a **matchup projection** (what we
expect for this specific matchup) and a **career projection** (your
long-term baseline). Both come from the projections engine and are visible
on the matchup preview page.

---

## See also

- [Commissioner Matchup Management](commissioner-matchup-management.md)
- [Matchup System Architecture](../architecture/matchup-system.md)
- [Matchup API Reference](../api/matchup-api.md)
- [League Flow Complete Guide](league-flow-complete-guide.md)
