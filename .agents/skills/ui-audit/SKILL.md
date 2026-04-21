---
name: ui-audit
description: 'Systematically navigate every web page at mobile, tablet, and desktop viewports, screenshot each, identify visual and functional bugs against the design system (https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb) and supplemental guidelines in AGENTS.md, and file bugs via the in-app bug report button. Use when the user wants a full UI audit, visual regression check, or design compliance sweep.'
---

# Skill: UI Audit

## Overview

Systematically visit every page of the web application at three viewports, visually inspect screenshots against the design system (https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb, canonical) and supplemental guidelines in `AGENTS.md`, and file each bug via the **in-app bug report button** — not directly through Jira MCP tools.

## When to Use

- User asks for a UI audit, visual regression check, or design compliance sweep
- User wants to find and file bugs across the web app
- After a large frontend change to verify nothing regressed

## Prerequisites

- `legacy-sports-browser` MCP server must be available (provides `browser_dev_start`, `browser_navigate`, `browser_screenshot`, `browser_screenshot_upload`, `browser_cleanup`)
- The dev server must have `VITE_JIRA_PROXY_URL` configured (the bug report button only renders when this is set)

## Steps

### Step 0: Setup

1. Fetch the design system at https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb (canonical tokens, colors, components). Read `AGENTS.md` (Design Context section) for supplemental brand and layout guidelines.
2. Start the dev server and **capture the returned `port`** — you'll need it for all navigation calls:
   ```
   const { port } = browser_dev_start({ worktreePath: "<your worktree path>" })
   ```
3. Verify the bug report button is visible — navigate to any page at desktop viewport and confirm the bug icon button exists in the top-right header.

### Step 1: Parse arguments

| Pattern              | Interpretation                                 |
| -------------------- | ---------------------------------------------- |
| Empty or `all`       | Full audit — visit every page                  |
| `/path` or page name | Targeted audit — visit only the specified page |

### Step 2: Audit pages

For each page, visit at **three viewports**: mobile (375x812), tablet (768x1024), desktop (1280x720).

At each page/viewport combination (always pass the `port` from Step 0):

```
browser_navigate({ url: "<path>", port, viewport: { width, height } })
browser_screenshot({ name: "<page-slug>-<viewport>" })
```

Inspect each screenshot against the checklist.

> :page_facing_up: **Full page list and inspection checklist**: see [references/audit-checklist.md](references/audit-checklist.md)

### Step 3: File bugs via in-app bug report

**Do NOT use Jira MCP tools or the Atlassian plugin to file bugs.** Use the in-app bug report button for every bug. This ensures consistent labeling, auto-populated technical details, and proper routing.

For each bug found:

1. **Grep the codebase** to identify the source file(s) — use `Grep` and `Glob` (not shell commands). You'll include this in the description.
2. **Take a screenshot** of the bug: `browser_screenshot({ name: "<bug-name>" })`. Save the returned `path` — you'll need it when attaching the image. Screenshots are saved under `<worktreePath>/.screenshots/<bug-name>.png`. Use filesystem-safe slugs for names (e.g. `league-detail-mobile`) — no `/` or `:` characters.
3. **Open the bug report dialog**:
   - **Desktop/tablet (preferred):** click the bug icon button in the top-right header.
   - **Mobile:** open the hamburger menu and use the bug report action there.
4. **Write a structured description** in the description textarea (max 1000 chars). Use this format:

```
[<width>x<height>] <page name>: <what's wrong>

Source: <source file path from grep>
Repro:
1. Navigate to <path>.
2. Set viewport to <width>x<height>.
3. Observe <element>.
Expected: <what should happen per the design system (https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb) and AGENTS.md Design Context>
Actual: <what happens>
Fix hint: <likely code or UI change needed>
```

5. **Attach the screenshot** — click "Add screenshot or video", upload the file from the `path` captured in step 2.
6. **Submit** — click "Submit Report". Wait for the confirmation showing the issue key (e.g. LS-####). Record the key.
7. **Close the dialog** and continue to the next bug.

> :page_facing_up: **Full description template and examples**: see [references/bug-ticket-template.md](references/bug-ticket-template.md)

### Step 4: Summary

After all pages are audited, print a summary table:

```
| Page | Viewport | Bug Count | Ticket Keys |
| ---- | -------- | --------- | ----------- |
| ...  | ...      | ...       | LS-####     |
```

### Step 5: Cleanup

Call `browser_cleanup()` to close the browser and kill dev servers.

## Gotchas

- **File bugs through the in-app button only** — never use `jira_create_ticket`, `mcp__*__createJiraIssue`, or any direct Jira API. The in-app form auto-adds labels (`user-reported`, `web`), technical details (URL, version, environment, browser), and routes through the Jira proxy with proper auth.
- **Bug report access varies by viewport** — on desktop/tablet the bug icon is in the top-right header; on mobile it's inside the hamburger menu. Both work — use whichever matches your current viewport.
- **One bug = one submission** — never bundle multiple issues into a single report. Each must be independently workable.
- **1000 char limit** — the description field has a max length. Be concise. Put the viewport, page, and defect on the first line. Repro steps and file path below.
- **Don't file cosmetic nitpicks** — focus on clear violations of the design system or `AGENTS.md` Design Context, broken layouts, functional issues, and accessibility failures.
- **Viewport-specific bugs** — prefix the description with the viewport (e.g. `[375x812]`) so the fixer knows exactly where it breaks.
- **If a page fails to load**, file it as a critical bug and move on.
- **If a page requires dynamic data** (e.g. league detail with an ID), check E2E fixtures in `apps/web-e2e/` for valid mock data, or navigate from a listing page.
- **MCP-first**: use `browser_*` tools, `Grep`, `Glob` — never raw shell commands for file search or browser automation.
