# Feature: about-github-deeplinks — External GitHub deep-link from About page

**Jira:** LS-7741
**Page:** `about` (Epic LS-5254)
**Platform:** Web
**File:** `apps/web/src/pages/about/AboutPage.tsx`

## Description

The About page renders two categories of external deep-links into the GitHub repository:

1. **Commit SHA link** — in the Build Information card, the commit SHA renders as a
   clickable anchor that opens `${repoUrl}/commit/${commitSha}` in a new tab when the
   feature flag is enabled. `commitUrl` is constructed as non-null only when `commitSha`
   matches `/^[0-9a-f]{7,40}$/i`; a `null` `commitUrl` always falls through to plain-text
   rendering regardless of flag state.
2. **Links card** — a dedicated card with a "View on GitHub" button (always present when
   the flag is enabled) and a "View Current Commit" button (present only when a valid
   `commitUrl` can be constructed).

Both link surfaces are gated behind the GrowthBook feature flag **`about-github-deeplinks`**
(default: `true`), which allows them to be disabled without a deploy.

## User Flow

1. User opens `/about` (signed-in or signed-out)
2. **Flag ON (default):** commit SHA renders as a gold underlined link; Links card shows
   "View on GitHub" and (if a valid SHA exists) "View Current Commit"
3. **Flag OFF:** commit SHA renders as plain monospace text; Links card is hidden entirely

## Broken-URL / Private-Repo State Coverage

| Scenario                                | Mitigation                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Repo renamed                            | Update `VITE_REPO_URL` env var (already overridable per environment config comment)                                   |
| Repo made private                       | Disable `about-github-deeplinks` in GrowthBook — links disappear without a deploy                                     |
| Invalid / missing commit SHA            | `commitUrl` set to `null` by `/^[0-9a-f]{7,40}$/i` guard in `AboutPage.tsx`; non-hex SHAs always render as plain text |
| SHA not found on GitHub (shallow clone) | Same guard — `commitUrl` is `null` for non-hex strings; `about-github-deeplinks` flag can suppress link entirely      |

## Related Bugs

| Key     | Summary                                                                                          | Severity |
| ------- | ------------------------------------------------------------------------------------------------ | -------- |
| LS-7617 | [GAP-002] Missed feature: External GitHub deep-link from About page (no Feature Story, untested) | High     |

## Why This Feature Story Was Filed

The original QA feature-extraction pass (GAP-002) identified that the About page hard-codes
a public GitHub repo URL and renders outbound deep-links with no Feature Story covering
broken-URL state, private-repo state, or whether the repo URL should be visible to
non-employees. This Feature Story was filed retroactively to document the feature, gate it
behind a GrowthBook flag, and provide a Jira parent for LS-7617.
