# Design sync report — Players Tab — Card Feed Redesign

**Imported at**: 2026-07-29
**Source**: `manual-local-sync` — handoff bundle delivered by the user as a local
folder, not fetched from Claude Design. There is no `claude.ai/design` URL for
this bundle, so `manifest.designs[].url` is `null` and `/sync-designs` will not
re-fetch it (same shape as the `profile-settings-2026-05-26` and
`mZQ6CvdGoj6nIX4rrQKE0A` entries).
**Jira**: [LS-8832](https://bkrupa.atlassian.net/browse/LS-8832)

## Summary

- 1 design imported (new)
- 3 files, no fonts or image assets

## Files

| Path                                | What it is                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `README.md`                         | Full handoff spec (fidelity: high, pixel-perfect). **This is the implementation contract.**      |
| `project/Players Tab.dc.html`       | Interactive design doc. **Option `1c` is the spec**; `1f` is a light-theme variant, `1a` is a before/after recreation of the pre-redesign screen. |
| `project/android-frame.jsx`         | Prototype device frame — presentation scaffolding only, not an implementation reference.         |

## Notes for implementers

- Sample data in the prototype (career leaders, 2025 NFL stats) is illustrative
  only; the `t` (trend) field on each prototype row is fabricated and has no
  backing data source in this repo — see LS-8832's implementation notes.
- Every hex value in the README is a **verification** reference. All colors must
  come from `@legacy-sports/design-tokens` or
  `lib/shared-components/src/utils/colors.ts`; nothing is pasted.
