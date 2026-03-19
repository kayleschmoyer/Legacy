# UI Screenshots

Any PR that changes a visible UI element **must include screenshots** in the PR description. This applies to:

- New pages, screens, or components
- Layout or spacing changes
- Color, font, or styling updates
- Loading states, empty states, or error states
- Mobile vs desktop layout differences
- Conditional UI (e.g. different views for commissioner vs player, logged-in vs guest)

### What to Capture

For each changed screen or component, show **Before** and **After** states. If the feature is entirely new (no "before"), show the new design with a clear label. Include:

- The full screen/page when the context matters
- Zoomed-in crops when the change is small or hard to see at full size
- Both mobile and desktop views if the layout differs across breakpoints
- Any interactive states that were changed (hover, active, disabled, error)

### How to Take Screenshots

**Web app:**

```powershell
# Start the local dev server
make dev-web
# Open http://localhost:4200 in a browser and use the browser's built-in
# screenshot tool (F12 → ... → Capture screenshot) or OS snipping tool
```

**Browser DevTools responsive mode** — use to capture mobile breakpoints:

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select a device preset (e.g. iPhone 14, Pixel 7)
4. Take a screenshot from the DevTools camera icon

**Playwright (automated screenshot for regression reference):**

```powershell
pnpm exec nx run web-e2e:e2e --headed
# Screenshots saved to test-results/
```

### How to Embed Screenshots in the PR Body

GitHub renders images pasted directly into the markdown editor, or referenced via URL:

```markdown
## Screenshots

### League Overview Page

**Before:**

![Before](https://github.com/user-attachments/assets/...)

**After:**

![After](https://github.com/user-attachments/assets/...)
```

When writing the PR body via an **agent** (using `create_file`):

> **Current limitation:** The Playwright MCP browser tools (`mcp_microsoft_pla_browser_navigate`, `mcp_microsoft_pla_browser_take_screenshot`) are **not currently configured** in this project. Automated screenshot capture is not available to agents.

**Agent workflow — leave a placeholder and prompt the human:**

1. Write the PR body with a placeholder `## Screenshots` section:

```markdown
## Screenshots

<!-- Screenshots required — UI changes detected in this PR.
     Please run `make dev-web`, navigate to the affected screens,
     capture Before/After screenshots, and paste them here before merging. -->
```

2. After creating the PR, note that screenshots still need to be added (e.g., in your summary to the user).
3. Do **not** skip or delete the `## Screenshots` section — leave the placeholder so reviewers know they are expected.

### Screenshot Checklist

Before creating the PR, confirm:

- [ ] Identified all files touching JSX/TSX/styles in the diff
- [ ] Captured before/after screenshots for each changed screen
- [ ] Screenshots are embedded in the `## Screenshots` section of the PR body
- [ ] Mobile and desktop views included when layout differs

### When Screenshots Are Not Required

Skip the Screenshots section only when **all** of the following are true:

- The PR contains zero changes to `.tsx`, `.jsx`, `.css`, `.module.css`, Tamagui, or style-related files
- No new routes, pages, or components are added
- No changes to loading/empty/error states

If uncertain, include screenshots — reviewers always benefit from visual context.
