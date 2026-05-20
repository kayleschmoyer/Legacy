# Design system breakpoints

_Started 2026-05-02 16:56 UTC_

---

## User

Should our design system include information about the intended mobile breakpoints?

## Assistant

Yes, absolutely — a design system for a sports product spanning mobile and web should document mobile breakpoints explicitly. Here's what I'd recommend including:

**Core breakpoints to define:**

- **Phone portrait** (e.g. 0–479px) — the primary mobile experience
- **Phone landscape / large phone** (e.g. 480–767px)
- **Tablet portrait** (e.g. 768–1023px)
- **Tablet landscape / small desktop** (e.g. 1024–1279px)
- **Desktop** (1280px+)
- **Wide desktop** (1536px+ or 1920px+) — if you have data-dense views

**What to document per breakpoint:**

- Pixel range and the token name (e.g. `$sm`, `$md`, `$lg` — Tamagui-style since you have a tamagui-config folder)
- Container max-widths and gutter sizes
- Type scale shifts (e.g. H1 drops from 56px → 40px → 32px)
- Spacing scale adjustments if any
- Grid column counts (4 / 8 / 12)
- Touch target minimums on mobile (44px)
- Component behavior changes (nav collapses to drawer, cards stack, tables become lists, etc.)

**Sports-specific considerations worth calling out:**

- Live score / scoreboard layouts at each breakpoint
- Stats table → mobile card transformations
- Video player aspect ratio handling
- Bracket / fixture grid reflow rules

Want me to draft a Breakpoints page for the design system? I can pull the actual values from your `tamagui-config` folder so the documented breakpoints match what's already in code, rather than inventing new ones. Just say the word and I'll explore the config and build it.

## User

Please update the design to include this information.

## Assistant

_[tool: list_files]_

_[tool: local_ls]_

_[tool: local_ls]_

_[tool: read_file]_

_[tool: list_files]_

I have access now. Let me check the tamagui config for actual breakpoint values.

_[tool: local_ls]_

_[tool: read_file]_

Let me check the tamagui config for actual breakpoint values.

_[tool: local_ls]_

_[tool: grep]_

_[tool: local_ls]_

I'll work without the local mount and use the documented values plus standard Tamagui breakpoints.

_[tool: local_ls]_

I'll proceed with the documented values plus standard Tamagui breakpoint conventions.

_[tool: snip]_

_[tool: grep]_

_[tool: read_file]_

Good — I have the pattern. Let me look at one more preview for the visual style/proportions, then build a Breakpoints card matching the existing style.

_[tool: read_file]_

_[tool: read_file]_

Now I have a clear picture. I'll build a Breakpoints preview card matching the existing style and update README.md to document the breakpoints. Tamagui's default media breakpoints (which this product would use) are: xxs 660, xs 800, sm 860, md 980, lg 1120, xl 1280, xxl 1420 — but adapted to baseball-product naming.

Looking at README clues: "Mobile breakpoint at ~800px" and "Max content width: 1280px (dashboard), 1200px (marketing)". I'll align with that.

_[tool: write_file]_

_[tool: local_ls]_

_[tool: snip]_

_[tool: local_grep]_

_[tool: local_grep]_

_[tool: snip]_

_[tool: local_read]_

The config uses `@tamagui/config`'s default media (no override), so the canonical Tamagui breakpoints apply: xxs 660, xs 800, sm 860, md 980, lg 1120, xl 1280, xxl 1420. Let me update the breakpoints file to match these actual values, plus check web for any media usage.

_[tool: snip]_

_[tool: local_grep]_

The web app uses `$gtSm`, `$gtMd`, `$gtLg` (Tamagui defaults: sm=860, md=980, lg=1120). Plus raw CSS media at 640/768/800/960/1024/1280. I'll update the breakpoints file with the actual Tamagui defaults and register it.

_[tool: snip]_

_[tool: write_file]_

_[tool: register_assets]_

_[tool: snip]_

Now let me update README.md to add a Breakpoints section, then call done.

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Added a **Breakpoints** card to the design system — `preview/breakpoints.html` — and a matching section to `README.md`.

The card mirrors the actual Tamagui defaults your config inherits (`$xxs` 0–659 → `$xxl` 1280+), and uses the `$gt*` form already in `web/src` (`$gtSm`, `$gtMd`, `$gtLg`). Includes:

- A scaled visual ruler with all seven bands
- A token table (range, device, use)
- Per-token grid sketches showing column count progression
- A reflow matrix (padding, gutters, grid columns, hero size, score size, nav pattern, hit targets)
- Sport-specific reflow notes for scoreboard, stats tables, draft board, brackets, and video player
