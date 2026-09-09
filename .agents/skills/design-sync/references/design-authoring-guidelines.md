# Design authoring guidelines (for the Claude Design agent)

Guidelines to hand to the agent working **inside Claude Design**, so the designs it produces can be pulled into this repo by `/pull-design` without hitting the `DesignSync` size cap, and so the pulling agent can tell production intent from options it must not implement.

Two problems these rules solve:

1. **`get_file` is capped at 256 KiB per file** and returns content inline — a single file at the cap costs ~65k tokens to read plus ~65k to write back out (~130k for one file). A file over the cap comes back `truncated: true` and **must not** be written into `docs/design/` at all; it has to go through the user-assisted Chrome _Export → Project HTML (.zip)_ route instead. Every oversized page is a design that cannot be synced by an agent.
2. **`list_files` returns no byte sizes**, so a puller with no prior local copy is planning blind. Predictable file sizes plus a self-declared index remove the guesswork.

The pulling side of this contract lives in [`../SKILL.md`](../SKILL.md) § "Large files: size the pull before you make it" and [`designsync-tool.md`](./designsync-tool.md).

---

## 1. Size budgets

| Budget                   | Value        | Why                                                                                                       |
| ------------------------ | ------------ | --------------------------------------------------------------------------------------------------------- |
| **Target** per HTML file | **≤ 60 KiB** | ~15k tokens to read. A whole design pulls in one comfortable pass.                                        |
| **Soft ceiling**         | **120 KiB**  | Still pullable, but the puller should be told why the file is that big (in `INDEX.md`, see §4).           |
| **Hard ceiling**         | **236 KiB**  | Within ~10% of the cap. The pulling agent is instructed to refuse anything above this and ask for a .zip. |
| **Absolute tool cap**    | 256 KiB      | `get_file` truncates. Never author a file that can reach this.                                            |
| Files per `write_files`  | 256          | Not usually binding, but keep a design's file count in the low hundreds.                                  |
| Path length              | ≤ 256 chars  | Shallow directories, short names.                                                                         |

**Rule of thumb:** if a rendered page is more than roughly 1,200 lines of HTML, it is over budget. Split it.

## 2. What eats the budget (fix these first, before splitting pages)

Splitting is the last resort. Most oversized pages are oversized for one of these reasons, and each has a cheaper fix:

| Cause                                                       | Fix                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Base64-embedded fonts** (`data:font/woff2;base64,…`)      | Write the font file to `project/fonts/` and reference it with a relative `@font-face src: url("../fonts/x.woff2")`. Never inline a font. |
| **Base64-embedded images / screenshots**                    | Write to `project/assets/` and reference relatively. Never inline a raster image.                                                        |
| **The same `<style>` block copied into every page**         | Hoist shared CSS into `project/colors_and_type.css` (tokens) and `project/styles/<name>.css`, and `<link>` them from each page.          |
| **Inlined icon SVG sprites repeated per page**              | One `project/icons/<name>.svg` per icon, or a single shared sprite sheet referenced by `<use href="…">`.                                 |
| **Every state of every component stacked in one page**      | This is the real split case — see §3.                                                                                                    |
| **Minified/compiled bundle output committed alongside src** | Don't ship build output. Ship the source prototype.                                                                                      |

Relative references are required: the pulling agent mirrors the project's path structure into `docs/design/<id>/<slug>/project/`, so relative paths keep working after the pull. Absolute URLs to claude.ai-hosted assets will not.

## 3. Intent classification

Every HTML file falls into exactly one of three classes. **Declare it explicitly** — the pulling agent must never have to infer whether a screen is the thing to build or one of five alternatives the designer offered.

### The three classes

| Class          | Meaning                                                                                                                                             | Consumed by `/implement-design`?                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **production** | The intent of record. This is what should be built, as shown. Exactly one production file per surface/screen.                                       | **Yes** — implemented, and counted by the slicing heuristic.        |
| **option**     | An alternative presented to the human for a decision: a variant panel, an A/B/C comparison, a direction study. Not yet chosen — or explicitly lost. | **No** — read for context only. Implementing an option is a defect. |
| **scratch**    | Working state: abandoned drafts, scraps, intermediate renders, kitchen-sink playgrounds.                                                            | **No** — ignored entirely.                                          |

An option is **promoted** to production by copying its content into the production file for that surface (and marking the option `@status chosen`) — not by relabeling in place, and not by leaving the puller to figure out which panel won.

### How to declare it — two signals, both required

**(a) Directory placement** — the consuming agents key off directory names:

```
project/
  <Surface>.html              # production — the pages that get built
  components/                 # production component prototypes
  colors_and_type.css         # production tokens
  ds/tokens.json
  styles/  fonts/  icons/  assets/
  options/                    # option panels — read for context, never implemented
    <surface>/
      a-dense-grid.html
      b-card-feed.html
  scratch/                    # working state — ignored
  scraps/                     #   "
  preview/                    #   "
```

`options/`, `scratch/`, `scraps/`, and `preview/` are excluded from the page count in [`slicing-heuristic.md`](./slicing-heuristic.md) and from implementation scope. Anything else under `project/` is treated as production.

**(b) A first-line marker in every HTML file** — directory placement can be lost in a re-export or a manual reorganization; the marker travels with the file:

```html
<!-- @intent production surface="draft-room" -->
```

```html
<!-- @intent option surface="draft-room" variant="dense-grid" status="proposed" -->
```

```html
<!-- @intent scratch note="pre-token-refresh draft, superseded 2026-09-01" -->
```

Fields:

- `@intent` — `production` | `option` | `scratch`. Required, first token.
- `surface` — the screen/route this file belongs to, in kebab-case. Required for `production` and `option`. Options for the same surface share one value; that is how the puller groups a panel.
- `variant` — short kebab-case name. Required for `option`.
- `status` — for `option` only: `proposed` (awaiting a decision), `chosen` (won; its content should already be in the production file), `rejected`. Default `proposed`.
- `note` — free text, optional.

If the project uses the Design System pane's `<!-- @dsCard … -->` marker, keep `@dsCard` on the first line and put `@intent` on the second.

**When the two signals disagree**, the marker wins and the puller reports the discrepancy — but don't rely on that. Make them agree.

### Option panels specifically

A "here are three directions, pick one" panel is the case this classification exists for. Author it as:

- **One file per option**, under `project/options/<surface>/<variant>.html`, each marked `@intent option`. Not one page with three columns — that page is 3× the size, and it forces the puller to fetch all three even when only one is wanted.
- **A thin index** at `project/options/<surface>/README.md` naming the surface, the question being asked, each variant with a one-line description, and the decision status. This is the file a human or agent reads to know a decision is pending.
- Once decided, update the production file for that surface, set the winner's `status="chosen"` and the others' `status="rejected"`, and record the decision in the index. Do not delete the losers — they are the design record.

## 4. `project/INDEX.md` — the self-declared size manifest

`list_files` gives structure but no byte sizes, so the puller cannot plan a fetch. Close that gap: write `project/INDEX.md` as the last step of any design change, listing every file the puller might fetch.

```markdown
# Index — Draft Room v2

Generated 2026-09-09. Sizes in bytes.

| Path                                 | Intent     | Surface    | Bytes   | Notes                             |
| ------------------------------------ | ---------- | ---------- | ------- | --------------------------------- |
| DraftRoom.html                       | production | draft-room | 48,220  |                                   |
| DraftRoomMobile.html                 | production | draft-room | 39,104  | 390px viewport                    |
| colors_and_type.css                  | production | —          | 12,880  | shared by all pages               |
| styles/board.css                     | production | —          | 9,412   |                                   |
| options/draft-room/a-dense-grid.html | option     | draft-room | 41,300  | status=rejected                   |
| options/draft-room/b-card-feed.html  | option     | draft-room | 44,905  | status=chosen → merged into above |
| scratch/kitchen-sink.html            | scratch    | —          | 210,556 | do not pull                       |

**Pull order for implementation:** colors_and_type.css, styles/board.css, DraftRoom.html, DraftRoomMobile.html.
**Total production bytes:** 109,616.
```

Two things make this worth writing: the puller can decide the whole fetch in one cheap read, and any file over the soft ceiling is visible before anyone spends 65k tokens discovering it.

## 5. Splitting a page that is genuinely too big

In priority order:

1. **By surface / route.** One HTML file per screen. A flow of four screens is four files, not one scrolling storyboard.
2. **By viewport.** `DraftRoom.html` (desktop) and `DraftRoomMobile.html` (390px) as separate files when the layouts genuinely differ. Same `surface` value in the marker.
3. **By component family.** Move component prototypes out of the page into `project/components/<Name>.html` (or `.tsx`), with the page showing the assembled layout and each component file showing its states. This is also what the slicing heuristic counts as components, so it maps directly onto how the work gets ticketed.
4. **By state, last.** If one component has many states (empty / loading / error / populated / over-limit), give it one file per group of related states rather than a single wall — `PlayerCard.html`, `PlayerCard.states.html`.

Do **not** split a single logical screen mid-DOM into `page-part1.html` / `page-part2.html`. Fragments that don't render standalone are worse than a big file: the puller cannot verify them, and the implementer cannot see the layout.

Every file must render standalone in a browser with its relative `<link>`s resolved.

## 6. Naming and structure

- File and directory names: `[A-Za-z0-9._-]` only. No spaces, no `#`, `?`, `:`, or non-ASCII — these break path handling and URL-encoding on the pull.
- Keep the tree shallow — two levels under `project/` is plenty.
- Never rename a production file casually. The manifest hash and the ticket ACs reference paths; a rename reads as a delete plus an add.

## 7. Self-check before finishing a design

Run through this before handing the design off:

- [ ] No file under `project/` exceeds 120 KiB (soft ceiling); nothing anywhere near 236 KiB except files explicitly marked `@intent scratch` and listed as "do not pull".
- [ ] No base64 font or raster image inlined in any HTML file.
- [ ] Shared CSS is hoisted into a linked stylesheet, not duplicated per page.
- [ ] Every HTML file carries a first-line `@intent` marker whose class matches its directory.
- [ ] Exactly one `production` file per `surface` per viewport — no ambiguity about what gets built.
- [ ] Every option panel has a `README.md` with the open question and current decision status.
- [ ] `project/INDEX.md` is regenerated and its byte counts are current.
- [ ] Every page renders standalone with relative asset paths.

---

## Paste-ready brief for the design agent

> **Authoring constraints for designs that will be synced into the Legacy Sports repo**
>
> A coding agent pulls your project file-by-file through a tool with a **hard 256 KiB per-file cap** — anything larger is unreachable and blocks implementation. Author to these rules:
>
> **Size.** Target ≤ 60 KiB per HTML file; never exceed 120 KiB without saying why. Never base64-inline fonts or images — write them to `fonts/` and `assets/` and reference them relatively. Hoist shared CSS into `colors_and_type.css` and `styles/*.css` and `<link>` it rather than repeating a `<style>` block in every page.
>
> **Intent.** Every HTML file is exactly one of **production** (the thing to build — one per screen per viewport), **option** (an alternative offered for a human decision — never implemented), or **scratch** (working state — ignored). Declare it two ways: put production pages directly under `project/`, options under `project/options/<surface>/<variant>.html`, and scratch under `project/scratch/`; **and** start each file with a marker comment:
> `<!-- @intent production surface="draft-room" -->` /
> `<!-- @intent option surface="draft-room" variant="dense-grid" status="proposed" -->` /
> `<!-- @intent scratch note="…" -->`
> Option panels are one file per option plus a `project/options/<surface>/README.md` stating the question and the decision status — never three directions stacked in one page. Promoting an option means copying it into the production file and marking it `status="chosen"`.
>
> **Splitting.** When a page is over budget, split by route first, then by viewport, then by pulling components out into `project/components/<Name>.html`, then by state. Never split mid-DOM into fragments — every file must render standalone.
>
> **Index.** Finish by writing `project/INDEX.md`: a table of every file with its path, intent class, surface, byte size, and notes, plus a recommended pull order for implementation and a total for production bytes. The pulling tool cannot see file sizes, so this table is how it plans the fetch.
>
> **Naming.** `[A-Za-z0-9._-]` only, no spaces, shallow directories, stable production filenames.

## See also

- [`../SKILL.md`](../SKILL.md) § Large files — the pulling side of this contract
- [`designsync-tool.md`](./designsync-tool.md) — access matrix, the 256 KiB cap, the .zip fallback
- [`slicing-heuristic.md`](./slicing-heuristic.md) — how production pages and components become tickets
- [`completeness-gate.md`](./completeness-gate.md) — what a bundle must contain to be implementable
