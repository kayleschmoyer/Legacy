# Manifest schema

Canonical source: [`docs/design/manifest.json`](../../../../docs/design/manifest.json). Updated only by the cloud sync agent — never edit by hand except to **seed** the initial design URL list (Phase 1, step 5 fallback).

## Shape

```jsonc
{
  "version": 1, // bump when schema breaks
  "lastSyncedAt": "2026-05-20T12:00:00Z", // ISO-8601 UTC, set by sync agent
  "designs": [
    {
      "id": "670f7892-5193-4b8a-a54c-20b112ad11bb", // Claude Design page UUID
      "url": "https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb",
      "title": "League Detail", // human label; sync agent updates this from the bundle's project name
      "slug": "legacy-sports-league-detail", // matches the single content directory under docs/design/<id>/
      "lastSyncedHash": "sha256-9a3f...", // see Hashing below
      "lastSyncedAt": "2026-05-20T12:00:00Z",
      "jiraKey": "LS-4561", // the most recent sync ticket for this design
      "status": "active", // active | archived
    },
  ],
}
```

### Field semantics

| Field                      | Required             | Notes                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                  | yes                  | Currently `1`. Sync agent refuses to operate on a higher version it doesn't recognize.                                                                                                                                                                                                             |
| `lastSyncedAt` (top-level) | yes after first run  | When the manifest itself was last rewritten.                                                                                                                                                                                                                                                       |
| `designs[].id`             | yes                  | The Claude Design page UUID. Used as the directory name under `docs/design/`.                                                                                                                                                                                                                      |
| `designs[].url`            | yes                  | The full Claude Design URL. Used by Phase 1 step 5 fallback discovery and by humans.                                                                                                                                                                                                               |
| `designs[].title`          | yes                  | Human-readable label. Sync agent updates this if the bundle's metadata changes.                                                                                                                                                                                                                    |
| `designs[].slug`           | yes after first sync | The single content directory under `docs/design/<id>/` (e.g. `legacy-sports-public-leagues`). Consumers (`/implement-design`) join paths as `docs/design/<id>/<slug>/...`. If absent on an older manifest entry, fall back to enumerating the single non-`SYNC-REPORT.md` directory under `<id>/`. |
| `designs[].lastSyncedHash` | yes after first sync | See Hashing.                                                                                                                                                                                                                                                                                       |
| `designs[].lastSyncedAt`   | yes after first sync | Per-design timestamp; differs from top-level when only some designs changed.                                                                                                                                                                                                                       |
| `designs[].jiraKey`        | yes after first sync | The **most recent** sync ticket. Older tickets remain queryable in Jira but aren't tracked here.                                                                                                                                                                                                   |
| `designs[].status`         | yes                  | `active` = present in latest discovery set. `archived` = was present once but not in latest discovery; the bundle directory is preserved.                                                                                                                                                          |

## Seeding (manual, first time only)

Before the first `/sync-designs` run you may want to seed URLs so the cloud agent has something to fall back to if the listing endpoint doesn't exist:

```jsonc
{
  "version": 1,
  "designs": [
    {
      "id": "670f7892-5193-4b8a-a54c-20b112ad11bb",
      "url": "https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb",
      "title": "League Detail",
      "status": "active",
    },
  ],
}
```

`lastSyncedHash`, `lastSyncedAt`, and `jiraKey` are left absent — the sync agent fills them on its first successful pass over that entry. The agent treats absent-hash as `new`.

## Hashing

`lastSyncedHash` is a deterministic content hash, format `sha256-<hex>`:

1. After extracting the bundle, enumerate every file under `docs/design/<id>/` **excluding** `SYNC-REPORT.md` (which the sync agent itself writes).
2. Sort the file list by relative path, lexicographically, case-sensitive.
3. For each file, compute `sha256(content)` as lower-hex.
4. Build the manifest string by joining `<relative-path>\t<sha256>\n` lines.
5. Final hash = `"sha256-" + sha256(manifest-string).toString("hex")`.

This way:

- Reordering files in the zip doesn't change the hash.
- A single byte change to any file changes the hash.
- Different bundles with the same content (e.g. across re-exports) collide deterministically.

## Status transitions

```
(missing entry) ──new──▶ active ──changed──▶ active
                                  └──removed─▶ archived ──re-appears──▶ active
```

`archived` entries are never deleted from the manifest. Their `docs/design/<id>/` directories also persist — that history is useful when an old design returns or a downstream PR was authored against the archived version.
