/**
 * Renders the MCP tool model as a self-contained, browsable reference page.
 *
 * The output carries no <!doctype>/<html>/<body> wrapper so it can be published
 * directly as a Claude Artifact; browsers render it as-is when opened locally.
 */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * Embed JSON safely inside a <script> block.
 *
 * Pretty-printed (not minified) so the per-server sections of the embedded
 * model land on stable, non-overlapping line ranges \u2014 the same reason
 * api-reference.json (also `JSON.stringify(model, null, 2)`) merges cleanly
 * across two PRs that touch different servers, while a single unindented
 * line here would force every edit onto the exact same line and conflict
 * unconditionally (LS-9816).
 */
function jsonScript(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const TRANSPORT_COPY = {
  stdio: {
    label: 'Local',
    detail: 'Launched per session from .mcp.json — runs on your machine.',
  },
  hosted: {
    label: 'Hosted',
    detail: 'AWS Lambda behind API Gateway — bearer-authenticated connector.',
  },
};

/**
 * Build the page.
 *
 * `meta.scope` switches to single-server mode: the page documents one hosted
 * server, which is what that server serves from its own `GET /docs` route. The
 * layout, filter, and schema tables are identical — only the framing changes.
 */
export function render(model, meta = {}) {
  const { servers } = model;
  const scope = meta.scope;

  // LS-11018: counts are filled in by the page script from the embedded model,
  // never written into the file — a committed total goes stale when two PRs
  // bump it to the same value and git merges the identical lines cleanly. See
  // artifactModel() in ./collect.mjs.
  const stats = scope
    ? [
        { stat: 'tools', label: 'Tools' },
        { stat: 'params', label: 'Parameters' },
        {
          value: servers[0].transports.includes('stdio') ? 'Both' : 'Hosted',
          label: 'Transport',
        },
      ]
    : [
        { stat: 'servers', label: 'Servers' },
        { stat: 'tools', label: 'Tools' },
        { stat: 'params', label: 'Parameters' },
        { stat: 'local', label: 'Run locally' },
        { stat: 'hosted', label: 'Hosted' },
      ];

  const title = scope ? `${scope.label} MCP Tools` : 'MCP Tool Index';
  const eyebrow = scope
    ? 'Legacy Sports &middot; hosted MCP server'
    : 'Legacy Sports &middot; agent toolchain';
  const lede = scope
    ? `Every tool this server exposes &mdash; names, descriptions, and full input
        schemas, read straight from <code>${escapeHtml(servers[0].packageDir)}</code>.
        One of the repo's MCP servers; all of them are indexed in
        <code>docs/mcp/api-reference.html</code>.`
    : `Every tool exposed by the Model Context Protocol servers in
        <code>tools/mcp/</code> &mdash; names, descriptions, and full input schemas, read
        straight from the server sources.`;

  return `<!-- GENERATED FILE — DO NOT EDIT, DO NOT HAND-MERGE.
     Regenerate with \`make mcp-api-reference\`; never resolve a git conflict
     here by hand-editing markers or picking a side — that silently drops the
     other side's tools/servers (see docs/mcp/tool-budget.json's _comment and
     LS-9816). -->
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
${styles()}
</style>

<div class="shell">
  <header class="masthead">
    <div class="masthead-inner">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${lede}</p>
      <dl class="statline">
${stats
  .map(
    (stat) => `        <div class="stat">
          <dt>${escapeHtml(stat.label)}</dt>
          ${stat.stat ? `<dd data-stat="${stat.stat}"></dd>` : `<dd>${escapeHtml(stat.value)}</dd>`}
        </div>`,
  )
  .join('\n')}
      </dl>
    </div>
  </header>

  <div class="controls">
    <div class="controls-inner">
      <label class="search" for="filter">
        <span class="visually-hidden">Filter tools</span>
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle cx="9" cy="9" r="5.5" />
          <line x1="13" y1="13" x2="17.5" y2="17.5" />
        </svg>
        <input id="filter" type="search" placeholder="Filter by tool name, description, or parameter" autocomplete="off" spellcheck="false">
        <kbd>/</kbd>
      </label>
      <div class="control-actions">
        <span class="result-count" id="result-count" role="status"></span>
        <button type="button" id="expand-all" class="ghost">Expand all</button>
        <button type="button" id="collapse-all" class="ghost">Collapse all</button>
      </div>
    </div>
  </div>

  <div class="layout${scope ? ' layout--single' : ''}">
    <nav class="rail" aria-label="Servers"${scope ? ' hidden' : ''}>
      <p class="rail-heading">Servers</p>
      <ul id="rail-list"></ul>
      <p class="rail-note">
        <strong>Local</strong> servers start per session from <code>.mcp.json</code>.
        <strong>Hosted</strong> servers run as Lambdas and need an authenticated connector.
      </p>
    </nav>

    <main id="results" tabindex="-1"></main>
  </div>

  <footer class="colophon">
    <p>
      Generated from <code>${escapeHtml(model.generatedFrom)}</code> by
      <code>scripts/generate-mcp-api-reference.mjs</code>.
      Re-run <code>make mcp-api-reference</code> after changing a server to refresh it.${
        meta.scope
          ? ' This page is served by the server itself at <code>GET /docs</code>, ' +
            'behind the same bearer token its tools require, and is redeployed with it.'
          : ''
      }
    </p>${
      meta.scope
        ? ''
        : `
    <p>
      Covers the servers this repo owns. <code>.mcp.json</code> also wires up the
      third-party Stripe MCP server, whose tools are documented by Stripe.
    </p>`
    }
  </footer>
</div>

<script id="mcp-model" type="application/json">${jsonScript(model)}</script>
<script>
${script()}
</script>
`;
}

function styles() {
  return `:root {
  color-scheme: light;
  --ground: #FBFAF7;
  --surface: #FFFFFF;
  --surface-sunk: #F3F2EC;
  --ink: #1A1B18;
  --ink-soft: #5D5F58;
  --ink-faint: #86887F;
  --rule: #E2E0D6;
  --rule-strong: #CFCCBE;
  --accent: #1F6F4A;
  --accent-soft: #E4EFE7;
  --accent-ink: #14512F;
  --hosted: #8A5A12;
  --hosted-soft: #F6EBD5;
  --shadow: 0 1px 2px rgba(26, 27, 24, 0.05), 0 8px 24px -18px rgba(26, 27, 24, 0.35);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ground: #14150F;
    --surface: #1C1E17;
    --surface-sunk: #24261E;
    --ink: #EDECE3;
    --ink-soft: #A7A99C;
    --ink-faint: #7E8074;
    --rule: #33352A;
    --rule-strong: #454736;
    --accent: #6FC494;
    --accent-soft: #1F3128;
    --accent-ink: #A7E0C0;
    --hosted: #DFB874;
    --hosted-soft: #362C18;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px -22px rgba(0, 0, 0, 0.9);
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #14150F;
  --surface: #1C1E17;
  --surface-sunk: #24261E;
  --ink: #EDECE3;
  --ink-soft: #A7A99C;
  --ink-faint: #7E8074;
  --rule: #33352A;
  --rule-strong: #454736;
  --accent: #6FC494;
  --accent-soft: #1F3128;
  --accent-ink: #A7E0C0;
  --hosted: #DFB874;
  --hosted-soft: #362C18;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px -22px rgba(0, 0, 0, 0.9);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

code, kbd, .mono {
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.shell {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px 72px;
}

/* --- Masthead ---------------------------------------------------- */

.masthead {
  border-bottom: 1px solid var(--rule);
  padding: 56px 0 32px;
}

.masthead-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.eyebrow {
  margin: 0;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

h1 {
  margin: 0;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: clamp(34px, 6vw, 52px);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.02;
  text-wrap: balance;
}

.lede {
  margin: 0;
  max-width: 62ch;
  color: var(--ink-soft);
  font-size: 16px;
}

.lede code { font-size: 14px; color: var(--ink); }

.statline {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: 14px 0 0;
  border-top: 2px solid var(--ink);
  border-bottom: 1px solid var(--rule);
}

.stat {
  flex: 1 1 auto;
  min-width: 96px;
  padding: 12px 20px 12px 0;
  border-right: 1px solid var(--rule);
}

.stat:last-child { border-right: 0; }

.stat dt {
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.stat dd {
  margin: 2px 0 0;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

/* --- Controls ---------------------------------------------------- */

.controls {
  position: sticky;
  top: 0;
  z-index: 20;
  margin: 0 -24px;
  padding: 0 24px;
  background: color-mix(in srgb, var(--ground) 92%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--rule);
}

.controls-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  padding: 14px 0;
}

.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 340px;
  padding: 9px 12px;
  background: var(--surface);
  border: 1px solid var(--rule-strong);
  border-radius: 3px;
}

.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.search svg {
  width: 16px; height: 16px;
  flex: none;
  stroke: var(--ink-faint);
  stroke-width: 1.6;
  fill: none;
  stroke-linecap: round;
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.search input::placeholder { color: var(--ink-faint); }

kbd {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--rule-strong);
  border-radius: 3px;
  background: var(--surface-sunk);
  color: var(--ink-faint);
  font-size: 11px;
}

.control-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.result-count {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

button.ghost {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-soft);
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  border-bottom: 1px solid var(--rule-strong);
}

button.ghost:hover { color: var(--accent); border-bottom-color: var(--accent); }
button.ghost:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

/* --- Layout ------------------------------------------------------ */

.layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 48px;
  align-items: start;
  padding-top: 32px;
}

/* Declared after .layout so it wins the cascade — same specificity, later rule. */
.layout--single { grid-template-columns: minmax(0, 1fr); }

.rail {
  position: sticky;
  top: 76px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rail[hidden] { display: none; }

.rail-heading {
  margin: 0;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.rail ul {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--rule);
}

.rail li { border-bottom: 1px solid var(--rule); }

.rail a {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 0;
  color: var(--ink-soft);
  text-decoration: none;
  font-size: 13px;
}

.rail a:hover, .rail a:focus-visible { color: var(--accent); }
.rail a[aria-current="true"] { color: var(--ink); font-weight: 600; }

.rail a[data-empty="true"] { opacity: 0.38; }

.rail .count {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.rail-note {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ink-faint);
}

.rail-note strong { color: var(--ink-soft); font-weight: 600; }
.rail-note code { font-size: 11px; }

/* --- Server sections --------------------------------------------- */

.server {
  scroll-margin-top: 84px;
  margin-bottom: 44px;
}

.server-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--ink);
}

.server-head h2 {
  margin: 0;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.015em;
}

.server-id {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--ink-faint);
}

.server-count {
  margin-left: auto;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.server-summary {
  margin: 10px 0 0;
  max-width: 74ch;
  color: var(--ink-soft);
  font-size: 14px;
}

.badges { display: flex; gap: 6px; }

.badge {
  padding: 2px 7px;
  border-radius: 2px;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge--stdio { background: var(--accent-soft); color: var(--accent-ink); }
.badge--hosted { background: var(--hosted-soft); color: var(--hosted); }

/* --- Tool rows ---------------------------------------------------- */

.tools { margin-top: 4px; }

.tool {
  border-bottom: 1px solid var(--rule);
  scroll-margin-top: 84px;
}

.tool > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 4px 16px;
  padding: 13px 4px 13px 0;
  cursor: pointer;
  list-style: none;
}

.tool > summary::-webkit-details-marker { display: none; }
.tool > summary:hover .tool-name { color: var(--accent); }
.tool > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.tool-name {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

mark {
  background: var(--accent-soft);
  color: var(--accent-ink);
  border-radius: 2px;
  padding: 0 1px;
}

.tool-meta {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chev {
  width: 9px; height: 9px;
  border-right: 1.5px solid var(--ink-faint);
  border-bottom: 1.5px solid var(--ink-faint);
  transform: rotate(45deg) translate(-2px, -2px);
  transition: transform 140ms ease;
}

.tool[open] > summary .chev { transform: rotate(225deg) translate(-1px, -1px); }

.tool-blurb {
  grid-column: 1;
  margin: 0;
  color: var(--ink-soft);
  font-size: 13.5px;
  line-height: 1.5;
  max-width: 82ch;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tool[open] .tool-blurb { -webkit-line-clamp: unset; overflow: visible; }
.tool--long[open] .tool-blurb { display: none; }

.tool-body {
  padding: 4px 0 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.tool-detail {
  margin: 0;
  max-width: 82ch;
  color: var(--ink-soft);
  font-size: 13.5px;
  white-space: pre-wrap;
}

.params {
  /* min-width:0 keeps the scroll container from being widened by the table it
     is meant to clip — otherwise a wide schema pushes the whole page sideways. */
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

thead th {
  padding: 6px 12px 6px 0;
  border-bottom: 1px solid var(--rule-strong);
  text-align: left;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
  white-space: nowrap;
}

tbody td {
  padding: 9px 12px 9px 0;
  border-bottom: 1px solid var(--rule);
  vertical-align: top;
}

tbody tr:last-child td { border-bottom: 0; }

td.param-name {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12.5px;
  white-space: nowrap;
}

td.param-type {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--ink-soft);
  white-space: nowrap;
}

td.param-desc {
  color: var(--ink-soft);
  min-width: 260px;
}

.req {
  display: inline-block;
  margin-left: 6px;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--hosted);
  vertical-align: 1px;
}

.pill {
  display: inline-block;
  margin: 1px 4px 1px 0;
  padding: 1px 6px;
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  background: var(--surface-sunk);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--ink-soft);
  white-space: nowrap;
}

.enum-list { display: flex; flex-wrap: wrap; margin-top: 4px; }

.subparams {
  margin-top: 6px;
  padding-left: 12px;
  border-left: 2px solid var(--rule);
  font-size: 12.5px;
  color: var(--ink-faint);
}

.subparams .mono { color: var(--ink-soft); }

.no-params {
  margin: 0;
  font-size: 13px;
  color: var(--ink-faint);
  font-style: italic;
}

.source {
  margin: 0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11.5px;
  color: var(--ink-faint);
}

.empty-state {
  padding: 60px 0;
  text-align: center;
  color: var(--ink-faint);
}

.empty-state strong { display: block; font-size: 17px; color: var(--ink); margin-bottom: 6px; font-family: 'Archivo', sans-serif; }

.colophon {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--rule);
  color: var(--ink-faint);
  font-size: 12px;
}

.colophon p { margin: 0; max-width: 80ch; }
.colophon code { font-size: 11.5px; }

@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; gap: 28px; padding-top: 24px; }
  .rail { position: static; }
  .rail ul { display: flex; flex-wrap: wrap; gap: 0 18px; border-top: 0; }
  .rail li { border-bottom: 0; }
  .rail-note { display: none; }
  .masthead { padding-top: 36px; }
  .tool > summary { grid-template-columns: minmax(0, 1fr); }
  .tool-meta { grid-column: 1; grid-row: 3; }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}`;
}

function script() {
  return `(() => {
  const model = JSON.parse(document.getElementById('mcp-model').textContent);
  const results = document.getElementById('results');
  const railList = document.getElementById('rail-list');
  const filterInput = document.getElementById('filter');
  const resultCount = document.getElementById('result-count');

  const TRANSPORTS = ${JSON.stringify(TRANSPORT_COPY)};

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const escapeRegExp = (value) => value.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');

  const highlight = (text, term) => {
    const safe = escapeHtml(text);
    if (!term) return safe;
    return safe.replace(new RegExp('(' + escapeRegExp(escapeHtml(term)) + ')', 'gi'), '<mark>$1</mark>');
  };

  /** Flatten a parameter descriptor into a readable type string. */
  const typeLabel = (param) => {
    if (param.type === 'array') {
      const inner = param.items ? typeLabel(param.items) : 'any';
      return inner + '[]';
    }
    if (param.type === 'union' && Array.isArray(param.variants)) {
      return param.variants.map(typeLabel).join(' | ');
    }
    if (param.type === 'record') {
      return 'record<' + (param.items ? typeLabel(param.items) : 'any') + '>';
    }
    if (param.type === 'enum' || param.type === 'literal') return 'enum';
    return param.type;
  };

  const searchText = (tool) => {
    const params = Object.entries(tool.inputs || {});
    return [
      tool.name,
      tool.description,
      ...params.map(([key, value]) => key + ' ' + (value.description || '')),
    ].join(' ').toLowerCase();
  };

  for (const server of model.servers) {
    for (const tool of server.tools) tool._haystack = searchText(tool);
  }

  // LS-11018: every count is derived here, not committed in the file.
  const toolTotal = model.servers.reduce((n, s) => n + s.tools.length, 0);
  const statValues = {
    servers: model.servers.length,
    tools: toolTotal,
    params: model.servers.reduce(
      (n, s) => n + s.tools.reduce((m, t) => m + Object.keys(t.inputs || {}).length, 0),
      0,
    ),
    local: model.servers.filter((s) => s.transports.includes('stdio')).length,
    hosted: model.servers.filter((s) => s.transports.includes('hosted')).length,
  };
  for (const el of document.querySelectorAll('[data-stat]')) {
    el.textContent = String(statValues[el.dataset.stat]);
  }

  const renderEnum = (values) =>
    '<div class="enum-list">' +
    values.map((v) => '<span class="pill">' + escapeHtml(JSON.stringify(v)) + '</span>').join('') +
    '</div>';

  const renderParamRow = (name, param, term) => {
    const bits = [];
    if (param.default !== undefined) {
      bits.push('<span class="pill">default ' + escapeHtml(JSON.stringify(param.default)) + '</span>');
    }
    for (const constraint of param.constraints || []) {
      bits.push('<span class="pill">' + escapeHtml(constraint) + '</span>');
    }
    if (param.nullable) bits.push('<span class="pill">nullable</span>');

    let extra = '';
    if (param.enum && param.enum.length) extra += renderEnum(param.enum);
    if (param.properties && Object.keys(param.properties).length) {
      extra += '<div class="subparams">' +
        Object.entries(param.properties)
          .map(([key, child]) =>
            '<span class="mono">' + escapeHtml(key) + '</span>: ' + escapeHtml(typeLabel(child)) +
            (child.optional ? '' : ' (required)'))
          .join('<br>') +
        '</div>';
    }

    return '<tr>' +
      '<td class="param-name">' + highlight(name, term) +
        (param.optional ? '' : '<span class="req">REQ</span>') + '</td>' +
      '<td class="param-type">' + escapeHtml(typeLabel(param)) + '</td>' +
      '<td class="param-desc">' + (param.description ? highlight(param.description, term) : '<span class="no-params">No description</span>') +
        (bits.length ? '<div class="enum-list">' + bits.join('') + '</div>' : '') + extra + '</td>' +
    '</tr>';
  };

  const renderTool = (tool, server, term) => {
    const params = Object.entries(tool.inputs || {});
    const required = params.filter(([, p]) => !p.optional).length;
    const summaryLine = tool.description.split(/(?<=\\.)\\s+/)[0] || tool.description;

    const meta = params.length
      ? params.length + (params.length === 1 ? ' param' : ' params') +
        (required ? ' \\u00b7 ' + required + ' required' : '')
      : 'no params';

    const table = params.length
      ? '<div class="params"><table><thead><tr>' +
        '<th scope="col">Parameter</th><th scope="col">Type</th><th scope="col">Description</th>' +
        '</tr></thead><tbody>' +
        params
          .sort(([, a], [, b]) => Number(a.optional) - Number(b.optional))
          .map(([name, param]) => renderParamRow(name, param, term))
          .join('') +
        '</tbody></table></div>'
      : '<p class="no-params">This tool takes no parameters.</p>';

    const fullDescription =
      tool.description !== summaryLine
        ? '<p class="tool-detail">' + highlight(tool.description, term) + '</p>'
        : '';

    return '<details class="tool' + (fullDescription ? ' tool--long' : '') + '" id="' +
      escapeHtml(tool.name) + '">' +
      '<summary>' +
        '<span class="tool-name">' + highlight(tool.name, term) + '</span>' +
        '<span class="tool-meta">' + escapeHtml(meta) + '<span class="chev"></span></span>' +
        '<p class="tool-blurb">' + highlight(summaryLine, term) + '</p>' +
      '</summary>' +
      '<div class="tool-body">' + fullDescription + table +
        '<p class="source">' + escapeHtml(server.packageDir) + '</p>' +
      '</div>' +
    '</details>';
  };

  const renderServer = (server, tools, term) =>
    '<section class="server" id="server-' + escapeHtml(server.id) + '">' +
      '<div class="server-head">' +
        '<h2>' + escapeHtml(server.label) + '</h2>' +
        '<span class="server-id">mcp__' + escapeHtml(server.id) + '__</span>' +
        '<span class="badges">' +
          server.transports
            .map((t) => '<span class="badge badge--' + t + '" title="' + escapeHtml(TRANSPORTS[t].detail) + '">' +
              escapeHtml(TRANSPORTS[t].label) + '</span>')
            .join('') +
        '</span>' +
        '<span class="server-count">' + tools.length + '/' + server.tools.length + ' tools</span>' +
      '</div>' +
      '<p class="server-summary">' + escapeHtml(server.summary) + '</p>' +
      '<div class="tools">' + tools.map((tool) => renderTool(tool, server, term)).join('') + '</div>' +
    '</section>';

  // Highlight the server the reader is currently in.
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.id;
      for (const link of railList.querySelectorAll('a')) {
        link.setAttribute('aria-current', link.getAttribute('href') === '#' + id ? 'true' : 'false');
      }
    }
  }, { rootMargin: '-80px 0px -70% 0px' });

  let currentTerm = '';

  const draw = (term) => {
    currentTerm = term;
    const needle = term.trim().toLowerCase();
    let shown = 0;
    let html = '';
    const railCounts = [];

    for (const server of model.servers) {
      const tools = needle
        ? server.tools.filter((tool) => tool._haystack.includes(needle))
        : server.tools;
      railCounts.push({ server, count: tools.length });
      shown += tools.length;
      if (tools.length) html += renderServer(server, tools, needle ? term.trim() : '');
    }

    results.innerHTML = html ||
      '<div class="empty-state"><strong>No tools match &ldquo;' + escapeHtml(term) + '&rdquo;</strong>' +
      '<span>Try a server name, a verb like &ldquo;rerun&rdquo;, or a parameter name.</span></div>';

    railList.innerHTML = railCounts
      .map(({ server, count }) =>
        '<li><a href="#server-' + escapeHtml(server.id) + '"' +
        (count ? '' : ' data-empty="true"') + '>' +
        '<span>' + escapeHtml(server.label) + '</span>' +
        '<span class="count">' + count + '</span></a></li>')
      .join('');

    resultCount.textContent = needle
      ? shown + ' of ' + toolTotal + ' tools'
      : toolTotal + ' tools';

    if (needle && shown && shown <= 12) {
      for (const el of results.querySelectorAll('.tool')) el.open = true;
    }

    for (const section of results.querySelectorAll('.server')) spy.observe(section);
  };

  let pending;
  filterInput.addEventListener('input', () => {
    clearTimeout(pending);
    pending = setTimeout(() => draw(filterInput.value), 90);
  });

  document.getElementById('expand-all').addEventListener('click', () => {
    for (const el of results.querySelectorAll('.tool')) el.open = true;
  });
  document.getElementById('collapse-all').addEventListener('click', () => {
    for (const el of results.querySelectorAll('.tool')) el.open = false;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== filterInput) {
      event.preventDefault();
      filterInput.focus();
      filterInput.select();
    }
    if (event.key === 'Escape' && document.activeElement === filterInput) {
      filterInput.value = '';
      draw('');
    }
  });

  draw('');

  // Deep link support: #tool_name opens that tool.
  const openFromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (target && target.tagName === 'DETAILS') {
      target.open = true;
      target.scrollIntoView({ block: 'start' });
    }
  };
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();`;
}
