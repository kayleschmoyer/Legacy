repo: bkrupa/legacy-sports
branch: main
path: .agents/skills/design-sync

## Last sync

date: 2026-09-09T07:01:02Z

### Updated in this project

- Read `design-authoring-guidelines.md` and audited the draft-room design against it.
- Restructured the mockups into a compliant `project/` tree: production pages, extracted component prototypes, split option panels, hoisted CSS/JS.
- Added `@intent` markers to every HTML file and generated `project/INDEX.md` as the size manifest.
- Original single-file mocks preserved under `project/scratch/`, marked do-not-pull.

## Screen map

| Project screen | Repo files |
| --- | --- |
| `project/DraftRoom.html` | `.agents/skills/design-sync/references/design-authoring-guidelines.md` (authoring contract only — no UI source read) |
| `project/DraftRoomMobile.html` | same |
| `project/DraftRoom.states.html` | same |
| `project/components/*.html` | same |
| `project/options/**` | same |

Note: this project is a design source, not a recreation of repo UI. Only the
design-sync authoring guidelines were read from the repository; no application
components were imported.
