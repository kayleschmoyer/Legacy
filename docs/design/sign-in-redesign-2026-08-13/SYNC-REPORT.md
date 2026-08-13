# Sync report — Sign-in Screen Redesign (2a — Lifted Abstract)

**Date:** 2026-08-13
**Jira ticket:** LS-9432
**Source:** manual-local-sync (no Claude Design project URL — this is a manually-exported design handoff, not a `/pull-design` pull)
**Source path (requester's machine):** `Mobile app sign in screen/design_handoff_sign_in_redesign/`
**Bundle hash:** `sha256-c6ca3c620512e148bfc95d97a8f8bdcf811d76d1868a74796123885938992b15`

## Bundle contents

```
docs/design/sign-in-redesign-2026-08-13/
  SYNC-REPORT.md
  legacy-sports-sign-in-redesign/
    README.md                    # copied verbatim from the handoff
    chats/
      chat1.md                   # substitution — see below
    project/
      2a-sign-in.html            # copied verbatim from the handoff (390x844 reference frame)
      colors_and_type.css        # substitution — see below
```

## Why not the standard DesignSync pull

The README's "Files" section references a "Sign In Redesign.dc.html in the design project (option 2a)" as the source-of-truth, implying a live Claude Design project exists. No share URL or project id was supplied alongside the handoff files. The existing `manifest.designs[]` entry for the prior "Login Page" project (`id: 4k4RdTqqAbEop0ZqmEDuOg`, `projectId: 9e1174b6-61d3-4321-88e2-ff3e318dcfed`) was checked as the most plausible candidate — `DesignSync get_project` on that id returned `404 project not found`, so it's not currently reachable. Per LS-9151 precedent, this bundle was hand-imported instead of chasing a share URL that wasn't provided; the manifest entry uses `source: "manual-local-sync"` and `url: null`. If a live project surfaces later, re-run `/pull-design <share-url>` — it will find this entry by matching Jira key / id and re-sync it as `designsync-local`.

## Substitutions vs. the completeness gate

This handoff is a flat, manually-exported bundle: `README.md` + one HTML prototype, nothing else. Two block-level checks (B3, B4) are not satisfied by a straight copy. Both were filled in deliberately, not silently:

- **B3 — `chats/` transcript**: no Claude Design chat export exists for this handoff. Added `chats/chat1.md` stating plainly that there is no Claude Design session and that `README.md` is the authoritative source of intent, rather than fabricating a fake transcript.
- **B4 — token source under `project/`**: the handoff documents all design tokens as prose in `README.md` § "Design Tokens (dark-theme resolutions)" rather than a `colors_and_type.css`/`ds/tokens.json` file. Generated `project/colors_and_type.css` by transcribing that section verbatim into CSS custom properties (background, brand navy/gold, text colors, radius, button height, font families). Values were transcribed 1:1 from the README text, not invented.

All other block-level checks (B1 README, B2 >=1 HTML prototype, B5 unique slug directory) pass on the copied content with no substitution needed — verified directly against the written bundle, not assumed.

## Next step

Bundle is ready for `/implement-design LS-####` once a follow-up implementation ticket is created (this ticket's scope is the sync only, per its Acceptance Criteria). Target files per the README: `lib/shared-components/src/features/auth/LoginPage.tsx` and `apps/app/src/app/login.tsx`.
