# Visual Judge Rubric (Mobile)

The rubric applied to every Maestro screenshot step — by the agent in-context (default) or by `scripts/mobile-qa/judge.mjs` (standalone; the script embeds this same rubric in its prompt). Ported from the ai-qa-agent judge pattern, adapted from web page-state to Android screenshots.

## Input per step

- 1–2 screenshots from `maestro/artifacts/<page>/` — when two, they are a **before/after pair** around a single interaction.
- The step name (`<page>/NN-<state>`), the flow file, and any Maestro errors from the run.

## Rules

- Only report issues with **concrete evidence** visible in the screenshots or flow errors. Never invent bugs, speculate, or report cosmetic preferences.
- Report each root-cause issue **once**; reuse the exact same title when it recurs on another screen (dedup keys on it).
- Title pattern: `[CATEGORY] Specific defect on <element/area>` — e.g. `[ui] Roster section header clipped on roster tab`, `[functional] Propose Trade dialog fails to advance after team selection`.
- Focus on what a real phone user notices: broken flows, error states, missing data, unreadable/truncated/overlapping text, spinners that never resolve, taps that visibly did nothing (before/after identical when a state change was expected).
- Mobile-specific checks: safe-area/notch overlap, tab-bar occlusion of content, truncation at narrow widths, low-contrast text, dark-mode artifacts, stretched or missing images, keyboard covering inputs.
- At most **5 issues per step** — only the most impactful.

## Confidence calibration

| Range   | Meaning                                                                        |
| ------- | ------------------------------------------------------------------------------ |
| 0.8–1.0 | Direct evidence in-frame: error text, blank screen, clipped element            |
| 0.5–0.7 | Likely issue inferred from indirect evidence                                   |
| < 0.5   | Speculative or minor — recorded but filtered out before filing (0.6 threshold) |

## Output shape

One JSON file per step in `maestro/artifacts/findings/` (this is `judge.mjs`'s output shape; in-context judging must emit the identical structure so `bug-filter.mjs` can consume it):

```json
{
  "stepName": "trade-center/03-after-propose-trade",
  "flow": "maestro/flows/trade-center/trade-center.yaml",
  "screenshots": [
    "maestro/artifacts/trade-center/03-after-propose-trade-team-step.png"
  ],
  "flowErrors": [],
  "pageSummary": "one-paragraph description of what the screen shows",
  "issues": [
    {
      "severity": "low | medium | high | critical",
      "category": "ui | ux | functional | content | accessibility | performance | navigation | consistency | other",
      "title": "[category] Specific defect on <element/area>",
      "description": "…",
      "expectedBehavior": "…",
      "actualBehavior": "…",
      "reproductionSteps": ["1-based user steps, starting from app launch"],
      "confidence": 0.85
    }
  ],
  "nextActions": ["optional follow-up probes for the agent"]
}
```

## Provenance and maintenance

- 2026-07-07: ported from ai-qa-agent `src/ai/judge.ts` `buildInstruction()`.
- Keep this rubric and the prompt inside `scripts/mobile-qa/judge.mjs` in sync — the script is the home of the machine-executed copy; this file is the home of the agent-executed copy.
