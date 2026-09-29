# Audio asset licensing

| File                 | Source                                                                                                                | Licence                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `touchdown-horn.wav` | Synthesized by [`scripts/generate-touchdown-horn.mjs`](../../../../../scripts/generate-touchdown-horn.mjs) (LS-10195) | Original work, project-owned. No third-party audio. |

The horn is generated from sine partials in code — no recording, sample, or
third-party material is used — so there is no external licence obligation.
Regenerate (deterministically) with:

```bash
node scripts/generate-touchdown-horn.mjs
```

To swap in a recorded horn later, replace the file with a CC0 / public-domain
clip of the same name and update the row above with its source and licence.
