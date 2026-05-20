# Completeness gate

The `/implement-design` agent runs this gate before doing any work. If **any block-level** check fails, the agent notifies on the Jira ticket and stops; it never implements partial designs by inference.

## Block-level checks (any one of these → notify and stop)

Each block-level miss is described as it should appear in the Jira comment so the human can act on it directly.

| ID  | Check                                                                                                                                            | Notify text                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `docs/design/<id>/bundle.json` exists                                                                                                            | "Bundle metadata is missing. Re-export this design from Claude Design and re-run `/sync-designs`."                                      |
| B2  | `bundle.json.pages` is a non-empty array                                                                                                         | "The bundle lists no pages. Add at least one page to the design in Claude Design before implementing."                                  |
| B3  | For each `pages[].file`, the referenced HTML exists under `docs/design/<id>/pages/`                                                              | "Page rendering for `<page-name>` is missing (`<expected-path>`). Re-export the design; this is usually a Claude Design export glitch." |
| B4  | `docs/design/<id>/ds/` contains at least one of: `tokens.json`, `colors_and_type.css`, or an equivalent token file referenced from `bundle.json` | "Design tokens are missing. The implementation cannot proceed without colors, type scale, and spacing values."                          |
| B5  | `bundle.json.intent` is a non-empty string (or `bundle.json` references an `intent.md` that exists)                                              | "The design has no stated intent. Add a 1-2 paragraph description of what this feature is and who it's for to the Claude Design page."  |

## Warning-level checks (log, but do not block)

These get logged in the agent's report but the agent still proceeds. Warnings exist so the human can address them in the Jira ticket without blocking the implementation.

| ID  | Check                                                                                                  | Warning                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| W1  | Every interactive element in the prototypes has an explicit state in `bundle.json.components[].states` | "Component `<name>` has no documented hover/focus/disabled states. Inferring from the prototype." |
| W2  | Empty states are defined for every list/grid in the design                                             | "No empty state for `<page>:<region>`. Defaulting to a generic empty illustration."               |
| W3  | Error states are defined for every form                                                                | "No error state for form `<name>`. Defaulting to inline field errors per AGENTS.md."              |
| W4  | Loading states are defined for any data-bound region                                                   | "No loading state for `<region>`. Defaulting to a skeleton per the shared component library."     |
| W5  | At least one screenshot per page exists in `docs/design/<id>/screenshots/`                             | "No reference screenshots. Visual review will rely on the rendered HTML only."                    |

## How to apply

1. Run every B-check. If any fails, build a Jira comment from the matching notify-text lines (use the template in [`SKILL.md`](../SKILL.md) §Notification template), transition to **Blocked**, and stop.
2. If all B-checks pass, run every W-check. Collect warnings into a single bullet list and include them in the agent's first commit message and PR description so reviewers can see them. Do not block on warnings.
3. Decide what counts as a "page", "component", "token", etc. by reading `bundle.json` first; fall back to file enumeration only if `bundle.json` is silent on a category.

## Why this exists

Without a gate, agents tend to "fill in" missing design details from training data — which produces generic AI aesthetics that violate the brand rules in AGENTS.md. Failing fast and pushing the gap back to the designer is cheaper than reviewing a wrong implementation.
