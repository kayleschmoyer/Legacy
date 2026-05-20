# Legacy Sports — Design System

> **Year-round fantasy baseball.** Draft legends across every era, compete on real archived statistics, and build your all-time dynasty.

A heritage-meets-modern brand for a fantasy sports app that keeps the game alive even when the season isn't. Think **night stadium** — deep navy with seam-red and aged-gold lighting, editorial serif type paired with a scoreboard-condensed display face.

---

## Index

- **`README.md`** — this file (overview, content guide, visual foundations, iconography)
- **`SKILL.md`** — cross-compatible skill definition for agent use
- **`colors_and_type.css`** — tokens + semantic type recipes (import this first)
- **`assets/`** — logos (`logo.png`, `logo-192.png`, `logo-512.png`, `apple-touch-icon.png`, `favicon.ico`)
- **`icons/`** — brand SVG glyph sprite + per-icon SVGs (baseball, football, trophy, seam-red catcher's mitt, etc.) and a Lucide CDN fallback map
- **`preview/`** — Design System cards (colors, type, radii, shadows, components). These populate the Design System tab.
- **`ui_kits/web/`** — high-fidelity React recreations of the web app (landing, home, scoreboard, league detail). Start at `ui_kits/web/index.html`.

---

## 1. Product context

**Legacy Sports** is a fantasy baseball league manager built for serious fans. The hook that differentiates it from DraftKings / ESPN Fantasy: **you can play with historical players, across every era**. Draft Babe Ruth alongside Mike Trout. Compete on real archived statistics. The product brings history and competition to the forefront, so fans can play year-round — not just during the in-season window.

Baseball is live. Football is framed as "Coming Soon" — the tokens and themes exist (turf green `#16A34A`, amber accent) but the main surfaces are baseball-forward.

### Products

- **Web app** (Vite + React + Tamagui, deployed to GitHub Pages) — the primary surface. Public landing page → OAuth (Google, Discord) → authenticated dashboard.
- **Mobile app** (React Native + Tamagui) — shares ~all components via `@legacy-sports/shared-components`. Not recreated in this system but the tokens are identical.
- **Commissioner tools, draft board, scoreboard, standings, player stats** — core surfaces inside the app.

### Sources (read-only mounts)

- `web/` — Vite/React web app. Primary source of truth for styles in this system.
- `shared-components/` — cross-platform (React Native + web) component library. Contains the full BrandIcon set (`shared-components/src/components/icons/BrandIcon.tsx`).
- `tamagui-config/` — theme tokens (`tamagui-config/src/lib/tamagui-config.ts`). Mirrored into `colors_and_type.css`.
- `uploads/logo.png` — user-uploaded primary logo (shield + baseball + laurel wreath + star).

---

## 2. Content Fundamentals

### Voice — second-person, confident, sport-nostalgic

Copy addresses the reader as **"you"** and talks about **"your league"**, **"your team"**, **"your dynasty"**. It's the voice of a commissioner or a clubhouse — confident, plain-spoken, a little heroic without being overheated. Never cutesy, never ironic.

Concrete patterns taken from the real product copy:

- **Hero (landing):** _"Build Your Dynasty. Dominate Your League."_ — Two-clause imperative, period after each clause, capitalised headline case.
- **Hero subcopy:** _"The only fantasy baseball platform powered by real MLB history — draft legends across every era and compete on archived statistics."_ — Single em-dash, no semicolons.
- **Feature titles:** "Live Stats", "Draft Tools", "Instant Updates", "Secure Leagues" — two-word noun phrases, title case.
- **Feature descriptions:** 1–2 sentences. End with a period. Use active verbs (_"updated as the game unfolds"_, _"so you never miss a move"_).
- **Section headlines:** _"Everything you need to win"_, _"Pick your sport"_, _"Choose Your Sport"_, _"Ready to play?"_ — Question form is fine for CTAs.
- **Dashboard welcome:** _"Welcome, {name}"_. `{name}` is `formatDisplayName()` of the first name.
- **Empty / onboarding:** _"Create or join your first league. Draft legends from across MLB history…"_

### Tone rules

- **Casing:** Headline case on marketing headings (H1/H2). Sentence case on section headers _inside_ authenticated views. UI labels are title case for primary affordances ("View League", "Create a League") and upper-case tracked for eyebrow/status badges ("DRAFT LIVE", "PRE-DRAFT", "ACTIVE", "COMING SOON").
- **I vs. you:** Always second-person **you**. Never first-person "I" or "we" outside of legal/support pages.
- **Emoji:** **Avoid.** The real product uses one `⚠️` on an error state; that's it. Use custom `BrandIcon` glyphs instead. No sparkles, no 🔥, no 🏆 — the trophy is a drawn SVG.
- **Unicode chars as accents:** `·` (middle dot) is the preferred inline separator ("Free to play · No credit card required", "12 teams · Week 14/22"). Em dash `—` for parenthetical asides. `▶` appears on live game badges.
- **Numbers:** Tabular, pad to one decimal for scores (`127.5`), integer for counts (`12 teams`). Records use `W-L` or `W-L-T` (`8-4`, `8-4-1`).
- **Time:** `Week 14/22`, `Draft: Fri Apr 12 · 8:00 PM`.
- **Error voice:** Neutral and actionable. _"Unable to load your leagues"_, not _"Oops!"_. Offer a Retry button, not an apology.

### Vibe

Imagine a clubhouse at dusk. Ken Burns documentary, narrator leaning on the rail. The product shows you numbers you can trust and treats the game with reverence. It is **not** hype-bro, **not** emoji-forward, **not** "vibes-based". It is quietly excited about the history of the sport and serious about the competition.

---

## 3. Visual Foundations

### Colors

The palette is anchored by three heritage brand colors and built on a "night stadium" dark backdrop. See the preview cards for swatches.

- **Brand navy** `#1B3A5C` — deep baseball navy (primary). Lightens to `#2C4A7C` for hover, darkens to `#143050` for press. This is the color of a backstop at night.
- **Seam red** `#C41E3A` — baseball laces. Used sparingly: live-draft badges, pitcher position chip, error accents, the "P" on a player card. Never used for primary actions.
- **Aged gold** `#C5A55A` — trophies, pennants, championship callouts, premium gating. In light mode it drops to `#B8942B` for AA contrast on white.
- **Night backgrounds** — `#0A0F1A` (page) → `#0D1526` (subtle surface) → `#111B2F` (panels) → `#16223A` (cards) → `#1C2A47` (raised). A 4-step elevation ladder, _not_ pure blacks.
- **Position colors** — each field position gets a semantic color: pitcher = seam red, catcher = steel gray, infield = dirt brown, outfield = grass green, utility = aged gold. These appear as the left-edge accent on player cards and position chips.
- **Status** — success `#22C55E` (turf green family), warning amber `#F59E0B`, danger `#E63950` (a lighter seam red), info `#3B82F6`.
- **Focus ring** — `#60A5FA` on dark, `#2563EB` on light. 3px outline, 2px offset.

Light mode exists and is internally consistent, but the product is **dark-theme-primary** — treat dark as the default for any marketing or product artifact.

### Type

Two-face system + a tabular mono for stats. Loaded from Google Fonts.

- **Display — Big Shoulders Display** (600 / 700 / 800 / 900). A condensed grotesque with scoreboard DNA. Used for all headings, scores, team abbreviations, status badges, eyebrows, button labels. Tight negative letter-spacing on hero sizes (`-0.02em`).
- **Body — Literata** (400 / 500 / 600 / 700, plus 400 italic). An optical-size serif that feels editorial — warm, readable, slightly bookish. Used for all paragraph prose, captions, metadata, descriptions. Comfortable at 16px.
- **Mono — JetBrains Mono** (400 / 500 / 700). Stats tables, timestamps, code samples in docs.

The pairing is deliberate: the **sport** speaks in condensed sans (scoreboard), the **history** speaks in serif (encyclopedia). Never swap their roles.

Scores on game cards are **Big Shoulders Display 800 at 36–64px, tabular-nums**. Team names stay in Literata so the score dominates and the team name reads as a caption.

### Spacing

4-based scale, matching Tamagui tokens `$2`–`$10`: **4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72**. Cards pad at `$5` (20px) default, headers at `$6` (24px). Grid gutters are `$4`–`$5`. Max content width is **1280px**, centered. Mobile breakpoint at ~800px flips padding to `$3` (12px).

### Radii

Surprisingly varied because the system maps different radii to different affordances:

- **`4px`** — inline tags, inning cells
- **`6px`** — text inputs, small utility buttons
- **`8px`** — status badges
- **`12px`** — buttons (default)
- **`16px`** — standard cards
- **`20px`** — prominent panels (scoreboard, league card)
- **`24px`** — hero cards (sport picker)
- **`9999px`** — pill chips (nav items, filters, status chips)

Cards are consistently `16–24px`. Buttons are `12–20px`. Chips are pills. Inputs are `6px`. This is strict — do not mix.

### Backgrounds

- **Page:** solid dark navy `#0A0F1A` with a **three-blob radial gradient** overlaid: navy top-left (22% alpha), seam-red top-right (10% alpha), gold bottom-center (8% alpha). This is the signature "night stadium" wash. It's `background-attachment: fixed`.
- **Hero bands:** linear gradient from `rgba(27,58,92,0.18)` → transparent, vertical.
- **Feature / sport cards:** 135° diagonal linear gradient from `#0A0F1A` to an accent color at 35–55% alpha.
- **Full-bleed imagery:** used only on marketing surfaces. When present, dark overlay (40–60% black) with navy/gold color-grading for cohesion. **Never** raw photography without treatment.
- **Textures / patterns:** no repeating patterns. The brand relies on gradients + solid surfaces for depth.

### Borders

Borders are thin (1px) and low-chroma. They default to `rgba(255,255,255,0.08)` (glass-border) on dark, `rgba(0,0,0,0.06)` on light. Hover bumps to `0.14` / `0.12`. Some cards use a gold-tinted border `rgba(197,165,90,0.7)` to signal a live draft or championship moment — rare, reserved for emphasis.

### Shadows

Dark-theme-tuned — deep navy rather than black:

- `--shadow-sm`: `0 1px 2px rgba(8,12,20,0.40)` — inline
- `--shadow-md`: `0 4px 14px rgba(8,12,20,0.55)` — cards
- `--shadow-lg`: `0 12px 32px rgba(8,12,20,0.65)` — modals, draft board
- `--shadow-xl`: `0 20px 48px rgba(8,12,20,0.75)` — hero lift
- `--shadow-gold`: `0 0 0 1px rgba(197,165,90,0.35), 0 6px 24px rgba(197,165,90,0.25)` — gold glow for premium/champion states
- `--shadow-seam`: seam-red glow for live-draft cards

No inner shadows. No double shadows. No drop-shadows on text.

### Transparency & blur

Used sparingly and always with intent:

- **Sticky headers / nav:** `rgba(10,15,26,0.75)` + `backdrop-filter: blur(14px)`. The `$background075` token.
- **Glass cards** on hero sections: `glass-surface` tokens.
- **Never blur foreground content** — blur is purely a surface treatment.

### Animation

The Tamagui config defines named presets. Defaults are:

- **`quick`** — `spring(damping: 20, mass: 1.2, stiffness: 250)` — buttons, toggles
- **`medium`** — `spring(damping: 15, stiffness: 120)` — card entry, page transitions
- **`bouncy`** — `spring(damping: 9, stiffness: 150)` — delightful confirmations
- **Timing:** `75ms`, `100ms`, `150ms` (`fast`), `200ms` — chip/badge transitions

Everywhere, `ease-standard` = `cubic-bezier(0.2, 0.8, 0.2, 1)`. Respect `prefers-reduced-motion`.

### Hover / press states

- **Buttons:** hover lightens background one step + `translateY(-1px to -2px)`. Press darkens + `scale(0.97–0.99)`.
- **Cards (clickable):** hover tightens border from `0.08 → 0.14` alpha + `translateY(-2px)` (or `-4px` for hero sport cards). Press scales to `0.98`.
- **Icon buttons:** hover swaps bg to `surfaceInteractive` (`rgba(27,58,92,0.22)`).
- **Links / text buttons:** hover shifts from `textMuted` to `fg1`.

Never use opacity for hover — always color or elevation. Never use pure black press states — always tinted navy.

### Cards

Default card contract:

- Background: `--surface-card` (dark) or a 135° gradient into an accent
- Border: `1px solid rgba(255,255,255,0.08)` (dark) / `rgba(0,0,0,0.06)` (light)
- Radius: `16px` (standard), `20–24px` (hero)
- Padding: `20–24px`
- Shadow: `--shadow-md` at rest, `--shadow-lg` on hover (when clickable)

Cards can have **three internal zones**: header (title + phase badge), body (score/record/content, often on a slightly tinted background stripe), footer (metadata: week X/Y, draft status, team count).

### Layout

- Max content width: **1280px** (dashboard), **1200px** (marketing).
- Sticky nav at top with 56px height.
- Grid: 12-col implicit, flexbox in practice (Tamagui `XStack` / `YStack`).
- Mobile: single column, padding reduces to `$3` (12px).

### Breakpoints

Seven named ranges, mirrored from the Tamagui `media` defaults consumed unchanged by `tamagui-config/src/lib/tamagui-config.ts` (no override). The product uses the **`$gt*` "greater-than" form** in JSX (`$gtSm`, `$gtMd`, `$gtLg`) — see `web/src/app/app.tsx`, `MatchupGrid.tsx`, `LeagueStandings.tsx`. See `preview/breakpoints.html` for the visual ruler, per-token sketches, and the full reflow matrix.

| Token  | Range        | Device                         | Notes                                                              |
| :----- | :----------- | :----------------------------- | :----------------------------------------------------------------- |
| `$xxs` | 0–659 px     | Phone · small portrait         | iPhone SE / older Androids. Single column, 12px gutters.           |
| `$xs`  | 660–799 px   | Phone · standard / large       | Most modern handsets. Single column, 16px gutters.                 |
| `$sm`  | 800–859 px   | Phone landscape · small tablet | `$gtSm` content (secondary nav links, profile name) appears above. |
| `$md`  | 860–979 px   | Tablet · portrait              | Hamburger drawer; primary top nav appears at `$gtMd`.              |
| `$lg`  | 980–1119 px  | Tablet landscape               | 8-col dashboard grid; matchup grid → 3-up at `$gtLg`.              |
| `$xl`  | 1120–1279 px | Small desktop / laptop         | Sidebar nav option; standings table at full column count.          |
| `$xxl` | 1280+ px     | Desktop & wide                 | Primary marketing/dashboard target — content caps at 1280.         |

**Sport-specific reflow:**

- **Scoreboard / `MatchupGrid`** — three columns at `$gtLg`, two at `$gtSm`, single stack below (matches `$gtSm: 50%`, `$gtLg: 33.333%` in source).
- **Stats tables** — true `<table>` at `$gtSm` and above; transform to per-player cards below, with the headline stat (AVG / ERA) pulled into a `.score` slot.
- **Draft board** — full grid only at `$gtLg`. Below that, collapse to a round-by-round timeline with the on-the-clock card pinned to the top.
- **Brackets / fixtures** — horizontally scroll within a fixed-height container at `≤ md`; never reflow round columns into rows (it breaks the metaphor).
- **Video player** — locks 16:9, full-bleed at `≤ sm`, capped at 880 px at `$gtMd`.

**Touch targets:** `44px` minimum on `$xxs`–`$md`; relax to `40px` from `$lg` up where pointer-precise input is more likely.

---

## 4. Iconography — see `icons/README.md` for detail

The product ships with a **custom brand-icon SVG library** (~80 glyphs) in `shared-components/src/components/icons/BrandIcon.tsx`. Style: 32×32 viewBox, Lucide-like 1.8px stroke, two-tone — a primary color + a seam-red or gold **accent** stroke. Hand-drawn sport-specific: baseball w/ curved seams, football with laces, trophy with pedestal, pennant, dugout, etc. **These are the source of truth.** Do not draw your own SVG unless you're matching this style exactly.

In this design system:

- `icons/brand/` contains the **most-used 16 glyphs** redrawn in the BrandIcon style (`baseball.svg`, `football.svg`, `trophy.svg`, `stats.svg`, `draft.svg`, `matchup.svg`, `roster.svg`, `scoreboard.svg`, `league.svg`, `commissioner.svg`, `live.svg`, `secure.svg`, `award.svg`, `standings.svg`, `bell.svg`, `zap.svg`).
- For generic UI glyphs (arrows, close, search, settings, user, clock, chevrons, etc.) the product uses **Lucide icons** via `@tamagui/lucide-icons`. Inside this design system we reference [Lucide via CDN](https://unpkg.com/lucide-static/) — see `icons/README.md` for the exact import pattern.
- **No emoji** anywhere in product UI. The one `⚠️` on an error state is a tolerated exception but should be swapped for `BrandIcon` `warning` when possible.
- **No PNG icons.** All icons are SVG.
- **Unicode chars as visual elements:** `·` (U+00B7, middle dot) as a separator; `▶` as a live-game indicator prefix; `←` `→` as inline date-nav arrows (should be upgraded to `BrandIcon chevron-left/right` for accessibility).

### Logo usage

The primary mark (`assets/logo.png`, 512×512, transparent PNG) is a navy shield + baseball + laurel wreath + gold star. It's used at:

- **38px height** in the sticky nav, paired with "Legacy Sports" wordmark in gold (Big Shoulders Display 800).
- **512px** as app icon.
- **192px** as PWA icon.

Do not recolor the logo. Do not strip the wreath or star. Clearspace = 1/4 the shield height on all sides.

---

## 5. Iteration notes & caveats

- **Football** is tokenised (turf green, amber) but the product only ships baseball surfaces. If you design a football artifact, mirror the baseball conventions but swap navy → green and seam-red → amber.
- The full BrandIcon library has ~80 glyphs; this system includes the top 16 as standalone SVGs. For the rest, reference the codebase directly or request a targeted copy.
- Light mode is internally consistent but _secondary_. Any marketing should be dark-theme-first.
