# Vendored SchemaStore schemas

Byte-exact copies of the JSON schemas that `scripts/validate-workflows.js` uses
to validate `.github/workflows/*.yml` and `.github/actions/**/action.yml`.

| File                   | Upstream                                            | Describes                       |
| ---------------------- | --------------------------------------------------- | ------------------------------- |
| `github-workflow.json` | <https://json.schemastore.org/github-workflow.json> | `.github/workflows/*.yml`       |
| `github-action.json`   | <https://json.schemastore.org/github-action.json>   | `.github/actions/**/action.yml` |

## Why these are checked in

`validate-workflows.js` used to fetch both schemas **live on every run**. That
made the `custom-checks` CI job a function of a third party's current HEAD
rather than of this repo's contents.

On 2026-09-01 SchemaStore tightened the `workflow_call` definition to reject a
null value. A bare `workflow_call:` key — valid at GitHub runtime, meaning
"callable, no inputs" — became a schema error overnight. Every open PR went red
at the same moment, including diffs that touched nothing but markdown. There was
no commit to bisect, nothing to revert, and no way to hold the old behaviour
while the fix landed (LS-9797).

Vendoring makes an upstream schema change arrive the way any other breaking
change does: as a commit you can review, bisect, and revert.

## Updating

```bash
make update-workflow-schemas          # fetch + write
make update-workflow-schemas CHECK=1  # report drift, write nothing
```

Then confirm the repo still validates and commit the schema diff **on its own**,
so the upstream change stays bisectable:

```bash
make lint-workflows
```

If refreshed schemas newly reject a workflow, that is a real decision to make —
either fix the workflow, or (if upstream is wrong about GitHub's actual runtime
behaviour) keep the older vendored copy and note why. Do not paper over it by
reverting to a live fetch.

`--check` is deliberately **not** wired into CI. Running it there would recreate
the exact failure mode this directory exists to prevent: upstream edits their
file, our CI goes red with no diff of ours.

## Do not reformat

These files are excluded from Prettier (`.prettierignore`). They must stay
byte-identical to what upstream serves, or every future upstream diff becomes
unreadable and the `--check` comparison breaks.
