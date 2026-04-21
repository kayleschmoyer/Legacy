---
name: bug-ticket-template
description: 'Structured bug description template for the in-app bug report form. Max 1000 characters.'
---

# Bug Report Description Template

Bugs are filed through the **in-app bug report button**, not directly via Jira. The form auto-populates technical details (page URL, app version, environment, browser UA), so focus the description on what's wrong and how to reproduce it.

## Description Format (max 1000 chars)

```
[<width>x<height>] <Page Name>: <concise summary of the defect>

Source: <file path from grep, e.g. apps/web/src/pages/baseball/LeagueDetailPage.tsx>
Repro:
1. Navigate to <exact path>.
2. Set viewport to <width>x<height>.
3. Observe <specific element or area>.
Expected: <What should happen per the design system (https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb), AGENTS.md Design Context, or common UX standards>
Actual: <What actually happens>
Fix hint: <CSS/style issue | responsive breakpoint | missing conditional | wrong Tamagui token>
```

## Examples

### Layout overflow bug

```
[375x812] League Detail: tab bar overlaps header text on mobile

Source: apps/web/src/pages/baseball/LeagueDetailPage.tsx
Repro:
1. Navigate to /baseball/league/123.
2. Set viewport to 375x812.
3. Observe the page header and tab navigation.
Expected: Header and tabs stack vertically with clear spacing
Actual: Tab bar overlaps the league name heading by ~12px
Fix hint: Responsive breakpoint — header needs mobile padding/margin adjustment
```

### Design system violation

```
[1280x720] Scoreboard: stats table uses wrong font for numbers

Source: apps/web/src/pages/scoreboard/ScoreboardPage.tsx
Repro:
1. Navigate to /scoreboard.
2. Observe the player stats columns.
Expected: Tabular numbers using Literata with font-variant-numeric: tabular-nums
Actual: Numbers use default proportional spacing, columns misalign
Fix hint: Wrong Tamagui token — apply $body font with tabular-nums variant
```

## Filing Workflow

1. Open the bug report dialog — on desktop/tablet use the bug icon in the top-right header; on mobile open the hamburger menu and use the bug report action there
2. Type description in the textarea (max 1000 chars)
3. Click "Add screenshot or video" to attach evidence (use the `path` returned by `browser_screenshot`)
4. Click "Submit Report"
5. Wait for confirmation — record the issue key (e.g. LS-####)
6. Close dialog and continue to the next bug

## Tips for Agent-Friendly Reports

- **First line is the summary** — the form uses the first 80 chars as the Jira issue summary
- **Always include viewport dimensions** in brackets on the first line
- **Always include the source file path** — grep for the component name before filing
- **One bug per submission** — never combine multiple issues
- **Attach a screenshot** showing the defect — this becomes the visual evidence for the fixer
