# Sync report: Notifications

**Design ID**: `c8_aVxWiMWOyjkMnoD-SkA`
**Source**: `designsync-local` (DesignSync MCP tool, projectId `019de999-f417-7627-9290-925dfd084b7d`)
**Synced at**: 2026-08-04T00:00:00.000Z
**Sync ticket**: LS-8967
**Bundle hash**: `sha256-bfd710a0dc1589435c0c513c65896f0a5d30f760e3e72ed16c18f0c8f1d986c1`
**Files**: 17

## What changed (vs 2026-05-20 sync, hash `0bc21b7a9754eead84725111f2bd51113650bd7727f94d796517f83d4c8c674d`)

Targeted pull after agent-driven source fixes for **LS-8967** (PROMPT.md brief
violations, audited in LS-8954) were pushed to the Claude Design project via
`finalize_plan` → `write_files`. Two files changed; all other bundle files are
untouched:

- `legacy-sports-notifications/project/scratch/mockups/notifications.html`
  (reviewer chrome) and `.../notifications-app.html` (production mockup):
  - Removed the JetBrains Mono Google Fonts import and `--font-mono` custom
    property from both files; every mono usage (time-ago, tabular numbers,
    error detail, page counter) now uses Literata + `tabular-nums`, matching
    the LS-8957 Design System precedent.
  - Replaced the invented `--info-blue`/`--type-draft` (green)/`#6FD39A`/
    `#8FB4E8` accents with brand.md's sanctioned tokens: added `--info`
    (`#5B84C4`) and `--warning` (`#C89452`) from the extended system-status
    palette (LS-9004), and remapped the five notification-type stripe colors
    to accent-rule-legitimate values — draft → gold (accent rule explicitly
    allows gold for "draft picks"), result → seam-red (loss), matchup →
    info (neutral system messaging), trade → warning (non-critical alert
    awaiting response), system → plain secondary text (not a system-status
    or outcome case). This also fixes the accent-semantics misuse the audit
    flagged (gold on the neutral `--type-matchup`, navy on a non-interactive
    stripe) — navy no longer used for a decorative type marker.
  - Unread indicator dot switched from the invented blue to gold, matching
    the already-audited Design System `components-notification.html`
    unread-dot pattern (`legacy-sports-design-system` bundle) for
    cross-page consistency. Deviation from `notifications.md`'s "blue"
    wording is called out in a new `<!-- HANDOFF -->` block for the page
    owner.
  - `@media (max-width: 900px)` / `(max-width: 480px)` → canonical band
    edges `979px` (below `$lg`/980) / `799px` (below `$sm`/800), matching
    `lib/design-tokens/src/lib/breakpoints.ts` and the LS-8957 precedent.
    375 and 1280 (the two harness viewports) still land on the correct
    side of both thresholds.
  - Added `:focus-visible` rings (`2px solid var(--text-primary)`, per
    PROMPT.md — gold is reserved for outcomes) to every interactive
    element: nav brand/tabs/icon-btn, filter chips, mark-read/mark-all/
    retry/empty-link buttons, pagination arrows, rail links, and the
    settings switches (which also gained `tabindex="0"` so they're
    actually reachable).
  - Tokenized remaining raw hex outside `:root` (`#fff` → `var(--text-strong)`,
    the avatar gradient, the empty-bell SVG's seam-red stroke) per the
    PROMPT.md token-discipline rule.
  - Per LS-9004's real-historical-players ruling, Notifications is not an
    exempted player-data surface, so all real MLB player names in the
    message copy (Babe Ruth, Hank Aaron, Greg Maddux, Cobb/Hornsby/Gehrig,
    Mariano Rivera, Vladimir Guerrero) were replaced with fictional names.
  - Added a `<!-- HANDOFF -->` block and `COMPONENT:` annotations
    (`n-card`, `day-sep`) per the current PROMPT.md's Handoff Notes section.

### Notes / gaps

- **Partial pull by design**: only the two files changed at the source were
  pulled; the rest of the bundle (`assets/`, `icons/`, `uploads/`) is
  unchanged from the 2026-05-20 sync.
- **Out of scope**: the current (updated) `docs/agents/pages/PROMPT.md`
  requires designed frames or explicit coverage annotations for all seven
  `xxs`–`xxl` breakpoint bands; this bundle only covers `xxs` (375) and
  `xxl` (1280) via the harness. That gap predates this ticket and is not
  one of the LS-8954 audit findings this ticket closes — flagged separately
  rather than expanding this PR's scope.
- No truncated reads (every `get_file` returned `truncated: false`); no
  binary fetches were needed.

## All files

```
legacy-sports-notifications/README.md
legacy-sports-notifications/chats/chat1.md
legacy-sports-notifications/project/assets/logo.png
legacy-sports-notifications/project/icons/award.svg
legacy-sports-notifications/project/icons/bell.svg
legacy-sports-notifications/project/icons/commissioner.svg
legacy-sports-notifications/project/icons/draft.svg
legacy-sports-notifications/project/icons/league.svg
legacy-sports-notifications/project/icons/live.svg
legacy-sports-notifications/project/icons/matchup.svg
legacy-sports-notifications/project/icons/scoreboard.svg
legacy-sports-notifications/project/icons/trophy.svg
legacy-sports-notifications/project/icons/zap.svg
legacy-sports-notifications/project/scratch/mockups/notifications-app.html
legacy-sports-notifications/project/scratch/mockups/notifications.html
legacy-sports-notifications/project/uploads/PROMPT.md
legacy-sports-notifications/project/uploads/notifications.md
```
