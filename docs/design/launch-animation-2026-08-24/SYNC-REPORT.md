# Design sync report — Animated Logo Draw → Punch-in Launch Screen (Android)

**Imported at**: 2026-08-24
**Source**: `manual-local-sync` — handoff bundle delivered by the user as a local
folder (`Animated logo draw-punch reveal/design_handoff_logo_launch_animation/`
on the requester's machine), not fetched from Claude Design. There is no
`claude.ai/design` URL for this bundle, so `manifest.designs[].url` is `null`
and `/sync-designs` will not re-fetch it (same shape as the
`players-card-feed-2026-07-29`, `mobile-draft-room-v2-2026-08-12`, and
`sign-in-redesign-2026-08-13` entries).
**Jira**: [LS-9746](https://bkrupa.atlassian.net/browse/LS-9746)

## Summary

- 1 design imported (new)
- 4 files, no fonts; one image asset (`logo-512.png`)

## Files

| Path                            | What it is                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `README.md`                      | Full handoff spec (fidelity: high for colors, stroke geometry, easing, sequencing). **This is the implementation contract.** |
| `project/Logo Draw Animation.dc.html` | Motion prototype entry (browser). Reference only — do not ship.                               |
| `project/logo-anim.jsx`          | Reference implementation: geometry constants, stagger schedule, easing math. Port values from here.  |
| `project/logo-512.png`           | Logo bitmap (padded, transparent) — the bitmap punched in during the punch-in phase.                |

## Notes for implementers

- The bundled `.dc.html` / `.jsx` files are a browser animation-engine prototype
  showing intended look, geometry, and timing — not production code. Recreate
  the choreography natively (`react-native-svg` and/or Skia for stroke drawing,
  `Animated`/Reanimated for the timeline, Tamagui for layout), slotting into the
  existing `AnimatedLaunchScreen.tsx` contract (`start` gate, `onFinished`,
  `LAUNCH_START_FAILSAFE_MS` fail-safe, Reduce Motion handling).
- Durations in the README are the "showcase" cut (5.0s total). Production must
  compress to the ~1.2s overlay-lifetime cap from LS-9464 — see the README's
  "Production timing" section for the compressed phase lengths.
- The app's existing logo/splash assets already cover this bundle's bitmap:
  canonical master `apps/web/brand/logo-master.png`, Android splash
  `apps/app/android/app/src/main/res/drawable/splashscreen_logo.png`. This
  bundle's `logo-512.png` matches `apps/web/public/logo-512.png`.
