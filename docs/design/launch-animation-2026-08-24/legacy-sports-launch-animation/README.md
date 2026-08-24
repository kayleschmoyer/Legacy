# Handoff: Animated logo draw → punch-in launch screen (Android)

## Overview
A new cold-start launch animation for the Legacy Sports React Native Android app: the brand medallion is sketch-drawn as gold ink strokes on the navy splash field, then "punches in" to the real logo bitmap with an overshoot pop, gold flash ring, and a small camera kick; the LEGACY SPORTS wordmark + tagline then **stamp in** (hard scale-down pop, no translate). It replaces/extends the reveal choreography inside the existing `AnimatedLaunchScreen` component.

Target repo: `bkrupa/legacy-sports` (branch `main`).

## Implementation Note (LS-9746, added post-handoff)
This section documents where the choreography actually landed. The original
handoff's "Where this lands" bullet below said to replace
`AnimatedLaunchScreen.tsx` in place — that bullet has since been corrected
below to match what actually shipped:

- The new choreography lives in a new **`AnimatedLaunchScreen.native.tsx`**,
  not in `AnimatedLaunchScreen.tsx`. `AnimatedLaunchScreen.tsx` (the web
  fork) is **unchanged** — react-native-svg (used for the sketch-draw stroke
  reveal) isn't safely usable under this repo's web jest/build pipeline, and
  nothing in this ticket's scope touches the web app. This mirrors the
  existing `DraftClockRing.tsx` / `DraftClockRing.native.tsx` platform-split
  pattern already used elsewhere in `lib/shared-components`.
- Consequently, `lib/shared-components/src/components/branding/index.ts` now
  only re-exports the names stable across both forks (`AnimatedLaunchScreen`,
  `AnimatedLaunchScreenProps`, `LAUNCH_FADE_OUT_MS`, `LAUNCH_TOTAL_MS`). The
  web-only `LAUNCH_REVEAL_MS`/`LAUNCH_HOLD_MS` constants and the
  native-only `LAUNCH_DRAW_MS`/`LAUNCH_PUNCH_MS`/`LAUNCH_STAMP_MS` constants
  are exported directly from their own file instead, since Metro/Jest
  resolve the bare `./AnimatedLaunchScreen` specifier per-platform at
  runtime and a name existing on only one side would come back `undefined`
  on the other.

The rest of this document (geometry, timings, design tokens) is left as
originally authored — it's still the accurate source for those values.

## About the Design Files
The bundled files are **design references created in HTML/JSX for a browser animation engine** — they show intended look, geometry, and timing, not production code. The task is to **recreate this choreography in the existing React Native app** using its established patterns: `react-native-svg` (or Skia) for the stroke drawing, `Animated`/Reanimated for the timeline, Tamagui for layout — slotting into the existing `AnimatedLaunchScreen.tsx` contract (`start` gate, `onFinished`, fail-safe timers, Reduce Motion handling). Do not ship the HTML.

## Fidelity
**High-fidelity** for colors, stroke geometry, easing, and sequencing. Durations below are the "showcase" cut used in the motion prototype; the production cut should be compressed (see Production timing) to respect the ~1.2s overlay-lifetime cap agreed on LS-9464.

## Where this lands in the codebase
- **As implemented (see Implementation Note above):** `lib/shared-components/src/components/branding/AnimatedLaunchScreen.native.tsx` (new file) carries this choreography; `AnimatedLaunchScreen.tsx` (web) is unchanged. The rest of this bullet's guidance still applies to the native file: keep the `start` gate + `LAUNCH_START_FAILSAFE_MS` fail-safe, fixed-length timeline independent of animation callbacks, `onFinished` timer, and the Reduce Motion path (jump to final frame — real logo + wordmark visible — and run only the opacity fade-out).
- Logo bitmap: the app's existing splash/logo asset (canonical master `apps/web/brand/logo-master.png`; Android splash uses `apps/app/android/app/src/main/res/drawable/splashscreen_logo.png`). The overlay background must stay `#0A0F1A` to hand off from the native splash without a flash.
- Wordmark component: reuse `BrandLogo wordmarkOnly` for the text; only its entrance animation changes.

## The Choreography (authored / showcase timings)
Four phases; total 5.0s showcase. All motion is transform + opacity only (brand rule).

### 1. Sketch draw — 2.1s
The medallion is drawn as **gold ink strokes** (`#C5A55A`, round caps/joins, `fill: none`) on the navy field, via stroke-dashoffset reveals. Element schedule, as fractions of the 2.1s draw phase (start–end; linear progress within each window):

| Stroke | Window | Stroke width (on 512 viewBox) |
| --- | --- | --- |
| Outer ring, circle r238 @ (256,256) | 0.00–0.28 | 7 |
| Inner ring, circle r212 @ (256,256) | 0.08–0.34 | 4 |
| Baseball, circle r106 @ (256,258) | 0.18–0.46 | 6 |
| Seams (mirrored pair) | 0.34–0.58 | 6 |
| Stitch ticks, 8 per seam, appear one-by-one | 0.46–0.72 | 4.5 |
| Laurel stems (mirrored arc polylines) | 0.42–0.68 | 5 |
| Laurel leaves, 12 per side, appear one-by-one | 0.56–0.88 | 7 |
| Star (5-point) | 0.78–1.00 | 5 |

Geometry (viewBox `0 0 512 512`, matching the padded logo-512 framing):
- Seam (left; right is `translate(512,0) scale(-1,1)` mirror): cubic bezier `M207,166 C156,222 156,296 207,350`. Ticks: 8 samples at u = 0.1…0.9, short 18px lines through the seam point, direction = normalize(normal + 0.45·tangent).
- Laurel: center (256,262), radius 176. Left stem = polyline through points at angles 96°→226° (10° steps, screen coords, 90° = bottom). Leaves at angles 106°+i·10° (i = 0…11): 30px stroke from stem point toward `0.55·tangent ± 0.8·radial` (alternating inner/outer).
- Star: center (256,104), outer r40 / inner r16, 10 points starting at −90°.
- Hand-drawn energy: the whole sketch group wobbles `rotate(0.9° · sin(34·t))` while drawing (zero once the punch starts). Omit under Reduce Motion.

### 2. Punch-in — 0.5s
- Sketch: fades out over the first 45% of the phase while scaling 1 → 1.08.
- Real logo bitmap: opacity 0 → 1 over phase 10–55%; scale 1.3 → 1.0 with **easeOutBack** (overshoot is the "punch").
- Flash ring: a 2px gold circle just outside the medallion, scaling 1 → 1.45 and fading 0.65 → 0 over the first 85%.
- Camera kick: the whole screen content scales +0.045, decaying to 0 over 0.45s with easeOutCubic.

### 3. Wordmark stamp — 0.9s
Lockup (48×2 gold rule at 65% opacity, "LEGACY SPORTS", tagline) enters as one unit:
- **Stamp, not rise**: scale 1.7 → 1.0 with easeOutBack over 0.45s; opacity 0 → 1 over the first 35% of that. No translateY.
- Smaller camera kick on impact: +0.025, decaying over 0.45s.

### 4. Hold + fade — 1.5s
Hold the finished launch screen; overlay fades out at the end (production: 150ms `LAUNCH_FADE_OUT_MS`).

### Production timing
Compress draw → punch to ≈ 0.95s + 0.45s (the prototype's "fast cut"), wordmark stamp during a ~0.4s hold, then the existing 150ms fade — keeps total ≈ within the LS-9464 budget. The choreography is identical; only phase durations change, so drive everything from one clock and scale phase lengths.

## Design Tokens
- Splash field: `#0A0F1A` (matches native splash bg)
- Ink / flash ring: heritage gold `#C5A55A`
- Wordmark: `$brandGoldLight` (prototype used `#D9BE7F`), Big Shoulders Display 800, 26–27px, letter-spacing 0.5, line-height 1
- Tagline: "Where history plays on." — Literata italic 13px, `$textMuted` (`#9CAAC5`)
- Rule: 48×2px, radius 2, `rgba(197,165,90,0.65)`
- Medallion render size: ~250px square, centered slightly above vertical center; 30px gap to lockup
- Easings: easeOutBack (punch + stamp), easeOutCubic (kick decay), easeOutQuad (fades), linear (stroke draw within each window)

## State Management
No new state beyond the existing component: one clock value (Animated.Value or Reanimated shared value) drives all phases; `begun` latch from `start` prop; `onFinished` on a fixed timer. Reduce Motion: skip phases 1–3, show final frame, keep only the fade-out.

## Assets
- `apps/web/public/logo-512.png` (padded, transparent — the bitmap punched in; included in this bundle as `logo-512.png`)
- No new assets needed: sketch strokes are code-drawn vector geometry.

## Files in this bundle
- `Logo Draw Animation.dc.html` — motion prototype entry (browser)
- `logo-anim.jsx` — **the reference implementation**: all geometry constants, stagger schedule, and easing math live here; port values from this file
- `logo-512.png` — logo bitmap
