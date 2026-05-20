# Design sync report

**Synced at**: 2026-05-20
**Branch**: `claude/sync-designs-SMwzg`
**Bucket epic**: [LS-4568](https://bkrupa.atlassian.net/browse/LS-4568)

## Summary

- 19 designs synced (all unique)
- 19 Jira tickets filed under bucket epic LS-4568
- 1 prior manifest entry archived (`670f7892-...`, superseded by `7SRWFMj3a6khIhwLuWkSKA`)
- 1 duplicate handle (`CUmGAu7o3G7Wx4YkFHCXQg`) discovered during sync and dropped — content was byte-identical to `F89Q4j6WFCFqqsZpQ4VhlQ` (Players Page, LS-4573)

## Synced designs

| Title              | Design ID                | Jira                                                   | Files |
| ------------------ | ------------------------ | ------------------------------------------------------ | ----- |
| Public Leagues     | `1tmNnzBvKmDjeJOie3JNkg` | [LS-4569](https://bkrupa.atlassian.net/browse/LS-4569) | 46    |
| Login Page         | `4k4RdTqqAbEop0ZqmEDuOg` | [LS-4570](https://bkrupa.atlassian.net/browse/LS-4570) | 54    |
| Design System      | `7SRWFMj3a6khIhwLuWkSKA` | [LS-4571](https://bkrupa.atlassian.net/browse/LS-4571) | 118   |
| Draft Board        | `B8P9BQz8s6NZ9Q-FqWI_yA` | [LS-4572](https://bkrupa.atlassian.net/browse/LS-4572) | 20    |
| Players Page       | `F89Q4j6WFCFqqsZpQ4VhlQ` | [LS-4573](https://bkrupa.atlassian.net/browse/LS-4573) | 66    |
| Account Management | `QjHjpBJxAbmU7Xcc8HWarw` | [LS-4574](https://bkrupa.atlassian.net/browse/LS-4574) | 13    |
| Preferences        | `UUCswUjg_28Xzcqii7Rt2Q` | [LS-4576](https://bkrupa.atlassian.net/browse/LS-4576) | 42    |
| Help               | `V7jS9JECVtF0zt_SkADLhw` | [LS-4577](https://bkrupa.atlassian.net/browse/LS-4577) | 18    |
| Intro Video        | `dzQl9ZQSmZK-brcCgMZJdg` | [LS-4578](https://bkrupa.atlassian.net/browse/LS-4578) | 54    |
| Homepage           | `nxFiEGqu3yPCDKpoNDmQWA` | [LS-4579](https://bkrupa.atlassian.net/browse/LS-4579) | 18    |
| Admin              | `r09ipdRY07dJXR9hh4J1Ug` | [LS-4580](https://bkrupa.atlassian.net/browse/LS-4580) | 56    |
| Baseball Minigames | `2ZKwS1lG5Pb1Z6NcPzNW7g` | [LS-4581](https://bkrupa.atlassian.net/browse/LS-4581) | 66    |
| Nav Bar            | `dNpCFgIxoT5OnLy71wHjrg` | [LS-4582](https://bkrupa.atlassian.net/browse/LS-4582) | 62    |
| Notifications      | `c8_aVxWiMWOyjkMnoD-SkA` | [LS-4583](https://bkrupa.atlassian.net/browse/LS-4583) | 17    |
| Scoreboard         | `lMe_Ka278wF48IaGC7FOWw` | [LS-4584](https://bkrupa.atlassian.net/browse/LS-4584) | 42    |
| Stats Page         | `qtqqKYxMFf1A8GY5NL9GNQ` | [LS-4585](https://bkrupa.atlassian.net/browse/LS-4585) | 49    |
| Player Details     | `kXxk3B29-DRvoJthw6UifA` | [LS-4586](https://bkrupa.atlassian.net/browse/LS-4586) | 15    |
| Create League      | `HI6N3yPYUzeh981B5SkXmw` | [LS-4587](https://bkrupa.atlassian.net/browse/LS-4587) | 87    |
| League Detail      | `qDGBVlOyaV-306Id0kWq0Q` | [LS-4588](https://bkrupa.atlassian.net/browse/LS-4588) | 90    |

## Dropped duplicate handles

| Handle                   | Identical to                                                                      | Notes                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `CUmGAu7o3G7Wx4YkFHCXQg` | `F89Q4j6WFCFqqsZpQ4VhlQ` ([LS-4573](https://bkrupa.atlassian.net/browse/LS-4573)) | Same bundle hash (`1fa0628cea69…`). Dropped from the manifest and from `docs/design/`; no separate Jira ticket filed. |

## Archived

| Title                       | Design ID                              | Reason                                                                                       |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| Legacy Sports Design System | `670f7892-5193-4b8a-a54c-20b112ad11bb` | Not present in current discovery set; superseded by `7SRWFMj3a6khIhwLuWkSKA` (Design System) |

## Extraction safety

All 19 bundles were extracted via the `tar` npm package (Node) with strict invariants enforced before any bytes hit disk:

- Path containment (resolve under target dir, reject absolute paths and drive letters)
- No symlinks, hardlinks, or special entries (regular files + directories only)
- Entry count ≤ 5000 per bundle
- Per-file size ≤ 50 MB; per-bundle size ≤ 200 MB
- Filename sanitization (no NUL, no control chars, no `..` segments)

No bundle violated any invariant. Extractor: `scratch/design-sync/extract-bundle.mjs`.
