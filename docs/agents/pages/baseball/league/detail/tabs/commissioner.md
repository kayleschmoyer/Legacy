# League Detail — Commissioner Tab

**Parent page**: [League Detail](../index.md)  
**Tab key**: `commissioner`  
**Visibility**: Commissioner only

---

## Layout

Accordion sections — "Next Step" open by default, all others collapsed.

---

## Next Step Control

**Component**: `NextStepControl`

Contextual controls based on draft status:

| Status      | Controls                                                 |
| ----------- | -------------------------------------------------------- |
| Pre-Draft   | "Start Draft" button                                     |
| In Progress | "Join Draft Room" button → `/baseball/league/{id}/draft` |
| Post-Draft  | "Create Week 1 Matchups" or "Advance Week" button        |

Shows current status display + success/error toast messages.

---

## Draft Settings

**Component**: `DraftSettingsControl`

| Setting            | Options                                  |
| ------------------ | ---------------------------------------- |
| Player pool        | All MLB / Hall of Fame only / Custom era |
| Era filter options | All / custom date range / Hall of Fame   |

Draft status display (read-only if in progress). Warning on unsaved changes.

**Mutation**: `useUpdateDraftSettingsMutation`

---

## Draft Pick Order

**Component**: `DraftOrderControl` _(lazy loaded)_

- List of teams in draft order
- Reorder with drag or arrow buttons
- Current turn indicator (if draft in progress)
- Randomize button
- Save changes

---

## League Branding

**Component**: `LeagueBrandingControl`

- League name editor
- League logo upload
- League banner upload
- Primary color + secondary color pickers

---

## League Settings

**Component**: `LeagueSettingsControl`

| Setting                   | Description                         |
| ------------------------- | ----------------------------------- |
| Games per matchup         | Total games in a matchup window     |
| SP starts per matchup     | Max starter appearances per matchup |
| Min career games filter   | Minimum career games to be eligible |
| Min career seasons filter | Minimum career seasons              |
| Total matchups            | Season length                       |
| Playoff enabled           | Toggle on/off                       |
| Playoff format            | 4 / 6 / 8 team bracket              |
| Multi-week playoff        | Toggle on/off                       |

---

## League Dues

**Component**: `LeagueDuesControl`

- Set dues amount
- Set due date
- Payment status tracking per team

---

## Tiebreaker Rules

**Component**: `TiebreakerConfig`

- Primary tiebreaker selector
- Secondary tiebreaker selector
- Tertiary tiebreaker selector

Options: Points For · Head-to-Head · Strength of Schedule

---

## Season Awards

**Component**: `SeasonAwardsControl`

- Award definitions (MVP, Cy Young, etc.)
- Recipients selection
- Voting period management (open/close voting)

---

## Achievement Restrictions

**Component**: `AchievementRestrictionsControl`

- Toggle achievements on/off
- Restrict specific achievement types

---

## Waiver Processing

**Component**: `WaiverProcessControl`

- Waiver period settings
- Waiver order reversal rules
- FAAB settings (if league uses FAAB)

---

## Scoring Editor

**Component**: `LeagueScoringEditor`

Point values for each tracked stat:

| Category | Stats                             |
| -------- | --------------------------------- |
| Batting  | Runs, Hits, HR, RBI, SB, BB, etc. |
| Pitching | Wins, K, ERA, saves, etc.         |
| Fielding | Errors, assists, etc.             |

Load/save scoring profiles.

**Query/Mutation**: `useLeagueScoringSettings()` + scoring mutations

---

## New Season

**Component**: `SeasonRenewalControl`

- "Create New Season" button
- Confirms current season is frozen
- Carries over league settings
- Redirects to new league on success

**Mutation**: `useSeasonRenewalMutation`

---

## Danger Zone

**Component**: `DeleteLeagueControl`

- "Delete League" button (destructive, red)
- Confirmation modal required
- Warning: action is irreversible

**Mutation**: `useDeleteLeagueMutation`
