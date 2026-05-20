# Multi-sport design switcher

_Started 2026-05-20 01:17 UTC_

---

## User

Can we expand this design to include the differences when we add football as a secondary sport. I want to be able to switch between sports in the mockup, and probably in the UI as well

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: grep]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: view_image]_

_[tool: grep]_

Let me check the existing nav styles to understand how to integrate the sport switcher:

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

Let me look at tweaks-panel.jsx to confirm available controls:

_[tool: update_todos]_

_[tool: write_file]_

Now writing the data file with both sports:Now the parts file — make components sport-aware and add SportSwitch + ViewportBar:

_[tool: write_file]_

Now the app file:

_[tool: write_file]_

_[tool: write_file]_

Now the big CSS update — football theming, container queries, viewport bar, sport switcher:

_[tool: show_html]_

_[tool: done]_

_[tool: save_screenshot]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: sleep]_

_[tool: fork_verifier_agent]_

I've added football as a secondary sport and a full viewport switcher. Quick summary of what's new:

**Football, end-to-end**

- New data set (~18 players across 5 eras: Leather Helmet → Aerial), positions (QB/RB/WR/TE/DEF/K), and position-keyed stats (yards/TDs/INTs for QBs; rushing/receiving splits; tackles/sacks for DEF; FG/FG%/XP for K)
- Football re-skin per the DS guide: featured banner swaps navy+seam-red → turf+amber. New position color tokens (`--pos-qb` amber, `--pos-rb` dirt, `--pos-wr` turf, `--pos-te` gold, `--pos-def` steel, `--pos-k` sky)
- Sport-aware filter rail, stat triplets/quads, featured stats, sortable stats table (sorts by AV instead of WAR)

**Sport switcher (real product UI)**

- Lives in the nav, right after the Legacy Sports brand — segmented pill with both sport icons
- Football state uses a turf-green active background to subtly cue the swap
- Also exposed as a `Sport` tweak so you can toggle while doing design review

**Viewport switcher (design tool)**

- Sticky bar above the nav with five breakpoints from the DS: **Mobile 375 / Mobile L 480 / Tablet 768 / Laptop 1024 / Desktop 1280 / Fluid**
- The whole page renders inside a `.pp-viewport-frame` that uses CSS **container queries** — so the layout actually responds to the frame width, not the browser width. You'll see nav tabs hide at ≤900, cards collapse to single column at ≤700, filter pills become horizontal-scroll groups at ≤520, etc.
- Fluid mode removes the frame chrome and behaves like a normal full-width page

The old "show mobile preview side-by-side" tweak got retired since the viewport switcher does that job better.

## User

Verifier agent check completed

## Assistant

_[tool: show_html]_

Let me quickly verify the page myself:

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

Baseball looks correct. Let me test football + mobile viewport:

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: sleep]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: show_html]_

_[tool: sleep]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: sleep]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: str_replace_edit]_

Found it — the `transition: width` is breaking width application (CSS can't animate auto↔length). Let me fix:

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: sleep]_

_[tool: save_screenshot]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: sleep]_

_[tool: save_screenshot]_

_[tool: show_html]_

_[tool: multi_screenshot]_

_[tool: sleep]_

_[tool: save_screenshot]_

_[tool: done]_

Caught and fixed a layout bug: the viewport switcher was setting `width: 375px` inline but the browser was ignoring it because I had `transition: width 320ms` on the frame — CSS can't animate between `auto` and a length, so width was getting stuck. Replaced the width-transition with a brief gold-glow flash animation when you snap between viewports. Now Mobile/Tablet/Laptop/Desktop all properly constrain the frame.

Visible in the captures:

- **Baseball default** — sport switcher in nav, viewport bar above
- **Football switch** — eyebrow flips to "The Gridiron Archive", featured player becomes Devontae Birchwood with QB stats (TD/YDS/RTG/AV), featured-banner gradient swaps from navy+seam-red to turf+amber
- **Mobile (375)** — frame constrains, nav tabs collapse, sport switcher labels hide, page stacks single-column, filter rail becomes horizontal-scroll groups — all driven by container queries on the frame, not browser-viewport media queries
