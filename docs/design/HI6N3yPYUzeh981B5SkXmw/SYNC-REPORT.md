# Sync report: Create League

**Design ID**: `HI6N3yPYUzeh981B5SkXmw`
**Source**: `designsync-local` (projectId `3b56ca5b-71bb-4a97-a3c6-d91c453a73d1`)
**Synced at**: 2026-08-04T15:22:50.000Z
**Bundle hash**: `66ac81d9b458d6db315bce119d8753b7395f137983dd74c6a3ce5a8ab2d71e88`
**Files**: 87
**Ticket**: LS-8963, LS-9084 (mechanical fixes only — see below)

## LS-9084 mechanical-fix pass

LS-9024 audited every synced bundle against PROMPT.md's Breakpoints checklist item (all seven
canonical bands — `xxs`/`xs`/`sm`/`md`/`lg`/`xl`/`xxl` per `lib/design-tokens/src/lib/breakpoints.ts` —
must be covered by a designed frame or an explicit `BREAKPOINTS:` annotation) and found this bundle
non-compliant: only two `VIEWPORTS` were defined (mobile 375, desktop 1280), and `shared.css`'s
`@container` rules reflowed at invented thresholds (`960px`/`720px`/`480px`) never mapped to the
canonical bands, leaving `xs`–`lg` (660–1119px) entirely unclaimed.

**Environment note**: this pass ran from a cloud session, where the `DesignSync` MCP tool is
unauthorized (it needs an interactive `/design-login` only available locally — see
`.agents/skills/design-sync/references/designsync-tool.md`). The design-source-fix pattern (fix in
Claude Design, then pull) could not be used. Per that doc's documented fallback ("provide the project
files directly"), the fix below was applied directly to this repo bundle instead. **Follow-up needed**:
a local session should push these same changes to the Claude Design project
(`projectId 3b56ca5b-71bb-4a97-a3c6-d91c453a73d1`) via `/push-design HI6N3yPYUzeh981B5SkXmw` so the
source of truth doesn't drift from the repo copy.

**Closed (2026-09-03)**: pushed `shared.css`, `Create League - Page.html`, and
`Create League - Modal.html` to the Claude Design project via `/push-design`. Source and
repo are back in step.

Fixed:

- Consolidated `shared.css`'s three invented `@container` thresholds (`960px`/`720px`/`480px`) into two
  canonical ones derived from `breakpoints.ts`: `1119px` (= xl/1120px minus 1, since `max-width` is
  inclusive) and `799px` (= sm/800px minus 1). Reflows now happen only at canonical thresholds.
- Added a `Tablet` (900px) designed viewport to the `VIEWPORTS` array in both HTML files, alongside the
  existing `Mobile` (375px) and `Desktop` (1280px) frames, so every distinct layout has a viewable frame.
- Added `BREAKPOINTS:` annotation comments (next to `VIEWPORTS` in both HTML files, and next to the
  `@container` rules in `shared.css`) documenting which bands share which designed frame: `xxs`+`xs`
  share Mobile (0–799px), `sm`+`md`+`lg` share Tablet (800–1119px), `xl`+`xxl` share Desktop
  (1120px+). All seven bands are now claimed; `xxs` (375px) and `xxl` (1280px) remain fully designed
  frames.
- Aligned the `Create League - Modal.html` inline `.ls-mock-dash` container query (previously
  `max-width: 720px`) to the same canonical `799px` threshold.

Not addressed by this pass (out of scope — see the LS-8963 section below for the full list of
deferred items; this bundle still needs a human-led Claude Design re-run for the wizard restructure).

## LS-8963 mechanical-fix pass

LS-8963 called for a full re-run of this design against the updated PROMPT.md brief, but the mockup
predates the current league-creation wizard entirely (84 commits of drift) and a proper re-run needs a
human-led Claude Design session using the shipped wizard flow as ground truth. This pass fixed only the
**mechanical** defects an agent could safely correct at the source via the `DesignSync` write flow,
scoped per the ticket:

- **Off-palette colors (HIGH)** — removed the "football theme overlay" in `shared.css` that reskinned
  `--brand-navy` to green (`#1A4733`/`#2D6A4F`) and `--brand-seam-red` to amber (`#F59E0B`/`#FBBF24`) for
  `[data-sport="football"]`, plus the matching off-palette rgba gradients on `.ls-vp-frame::before`,
  `.ls-sport-tab.on`, and `.ls-modal-head`. brand.md fixes navy/seam-red/gold as constant brand anchors —
  they aren't supposed to swap per sport. Football now renders with the same on-brand tokens as baseball;
  sport differentiation stays in copy/icons/data.
  Removed the banned `.theme-light` / `[data-theme='light']` override block from `colors_and_type.css`
  (brand.md: "No light-theme surfaces anywhere ... including token files").
- **Invented breakpoints (MED)** — the `VIEWPORTS` design-tool array in both HTML files used
  `390/768/1024/1280`. PROMPT.md's mobile/desktop convention is `375`/`1280` only; `768`/`1024` aren't
  part of the design system. Trimmed to `mobile: 375` and `desktop: 1280` (+ `full`).
- **Focus states (MED)** — `shared.css` had zero `:focus-visible` handling outside the `.ls-input:focus`
  rule (which fires on mouse click too). Added a global `:focus-visible { outline: 2px solid
  var(--focus-ring); outline-offset: 2px; }` rule so keyboard navigation is visible across buttons, tabs,
  links, and chips.

**Note on diff size** — the pre-2026-08 repo copies of these files were prettier-formatted even though
`docs/design/` is prettier-ignored ("preserve as-imported"); this sync pulls raw remote bytes per the
LS-8957 hashing fix, so `shared.css` in particular reverts from expanded/indented to the source's
single-line minified rules. The functional diff is limited to the three items above — diff the rendered
CSS, not the line count, to see the real change.

**Not addressed by this pass** — needs a human-led Claude Design re-run:
new league-creation wizard structure (sport/defensive-format/per-position roster config, native wizard
LS-6146), football scoring presets (Standard/Half-PPR/PPR, IDP toggle, 17-game cap), premium economics UI
(auction budget/min-bid, custom FAAB, salary floor/luxury tax/min salary/escalation %, era-filter
upsells), guardrails (invite-code confirmation interstitial, unsaved-changes warning, public-league
exposure warning, odd-team bye-week warning, free-tier 3-league cap), zero `@media` (container-query-only
pattern retained — mechanical scope did not touch the responsive architecture), React/Babel mockup
shells, missing HANDOFF/COMPONENT docs.

## Pages

- `legacy-sports-create-league/project/Create League - Modal.html`
- `legacy-sports-create-league/project/Create League - Page.html`

## All files

```
legacy-sports-create-league/README.md
legacy-sports-create-league/chats/chat1.md
legacy-sports-create-league/chats/chat2.md
legacy-sports-create-league/project/Create League - Modal.html
legacy-sports-create-league/project/Create League - Page.html
legacy-sports-create-league/project/CreateForm.jsx
legacy-sports-create-league/project/assets/favicon.ico
legacy-sports-create-league/project/assets/logo.png
legacy-sports-create-league/project/colors_and_type.css
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-600-latin.woff2
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-700-latin.woff2
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-800-latin.woff2
legacy-sports-create-league/project/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
legacy-sports-create-league/project/fonts/Literata-italic-400-cyrillic-ext.woff2
legacy-sports-create-league/project/fonts/Literata-italic-400-cyrillic.woff2
legacy-sports-create-league/project/fonts/Literata-italic-400-greek-ext.woff2
legacy-sports-create-league/project/fonts/Literata-italic-400-greek.woff2
legacy-sports-create-league/project/fonts/Literata-italic-400-latin-ext.woff2
legacy-sports-create-league/project/fonts/Literata-italic-400-latin.woff2
legacy-sports-create-league/project/fonts/Literata-italic-400-vietnamese.woff2
legacy-sports-create-league/project/fonts/Literata-normal-400-cyrillic-ext.woff2
legacy-sports-create-league/project/fonts/Literata-normal-400-cyrillic.woff2
legacy-sports-create-league/project/fonts/Literata-normal-400-greek-ext.woff2
legacy-sports-create-league/project/fonts/Literata-normal-400-greek.woff2
legacy-sports-create-league/project/fonts/Literata-normal-400-latin-ext.woff2
legacy-sports-create-league/project/fonts/Literata-normal-400-latin.woff2
legacy-sports-create-league/project/fonts/Literata-normal-400-vietnamese.woff2
legacy-sports-create-league/project/fonts/Literata-normal-600-cyrillic-ext.woff2
legacy-sports-create-league/project/fonts/Literata-normal-600-cyrillic.woff2
legacy-sports-create-league/project/fonts/Literata-normal-600-greek-ext.woff2
legacy-sports-create-league/project/fonts/Literata-normal-600-greek.woff2
legacy-sports-create-league/project/fonts/Literata-normal-600-latin-ext.woff2
legacy-sports-create-league/project/fonts/Literata-normal-600-latin.woff2
legacy-sports-create-league/project/fonts/Literata-normal-600-vietnamese.woff2
legacy-sports-create-league/project/icons/brand/award.svg
legacy-sports-create-league/project/icons/brand/baseball.svg
legacy-sports-create-league/project/icons/brand/bell.svg
legacy-sports-create-league/project/icons/brand/draft.svg
legacy-sports-create-league/project/icons/brand/football.svg
legacy-sports-create-league/project/icons/brand/league.svg
legacy-sports-create-league/project/icons/brand/live.svg
legacy-sports-create-league/project/icons/brand/matchup.svg
legacy-sports-create-league/project/icons/brand/roster.svg
legacy-sports-create-league/project/icons/brand/scoreboard.svg
legacy-sports-create-league/project/icons/brand/secure.svg
legacy-sports-create-league/project/icons/brand/stats.svg
legacy-sports-create-league/project/icons/brand/trophy.svg
legacy-sports-create-league/project/icons/brand/zap.svg
legacy-sports-create-league/project/scraps/01-check-modal.png
legacy-sports-create-league/project/scraps/01-check3.png
legacy-sports-create-league/project/scraps/01-click.png
legacy-sports-create-league/project/scraps/01-fresh.png
legacy-sports-create-league/project/scraps/01-inspect2.png
legacy-sports-create-league/project/scraps/01-manual.png
legacy-sports-create-league/project/scraps/01-mobile-football.png
legacy-sports-create-league/project/scraps/01-mobile.png
legacy-sports-create-league/project/scraps/01-page.png
legacy-sports-create-league/project/scraps/01-rules.png
legacy-sports-create-league/project/scraps/02-check-modal.png
legacy-sports-create-league/project/scraps/02-check3.png
legacy-sports-create-league/project/scraps/02-click.png
legacy-sports-create-league/project/scraps/02-fresh.png
legacy-sports-create-league/project/scraps/02-inspect2.png
legacy-sports-create-league/project/scraps/02-manual.png
legacy-sports-create-league/project/scraps/02-mobile-football.png
legacy-sports-create-league/project/scraps/02-mobile.png
legacy-sports-create-league/project/scraps/02-page.png
legacy-sports-create-league/project/scraps/02-rules.png
legacy-sports-create-league/project/scraps/03-check-modal.png
legacy-sports-create-league/project/scraps/03-click.png
legacy-sports-create-league/project/scraps/03-fresh.png
legacy-sports-create-league/project/scraps/03-page.png
legacy-sports-create-league/project/scraps/check2.png
legacy-sports-create-league/project/scraps/check4.png
legacy-sports-create-league/project/scraps/default-mobile.png
legacy-sports-create-league/project/scraps/final-desktop.png
legacy-sports-create-league/project/scraps/inline.png
legacy-sports-create-league/project/scraps/inspect.png
legacy-sports-create-league/project/scraps/now.png
legacy-sports-create-league/project/shared.css
legacy-sports-create-league/project/uploads/PROMPT.md
legacy-sports-create-league/project/uploads/create.md
```
