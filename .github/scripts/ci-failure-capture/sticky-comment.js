/**
 * Shared "one sticky comment, many sections" helper for CI reporters.
 *
 * Every CI check that wants to report status on a PR writes into a single
 * comment identified by MARKER. The body is a document with one delimited
 * section per producer (pipeline, schema, migrations, …). A producer only ever
 * rewrites *its own* section, so checks running in independent workflows can
 * share the comment without clobbering each other — and re-runs edit in place
 * instead of posting a new comment every time.
 *
 * The string functions (upsertSection / removeSection / parseSections) are pure
 * and unit-tested. `applySection` is the thin async wrapper that does the
 * GitHub round-trip with retry-on-transient and a verify-retry that heals the
 * rare case where two producers write concurrently (last-writer-wins would
 * otherwise drop one section).
 */

'use strict';

const MARKER = '<!-- CI-PIPELINE-STATUS -->';
const REGION_START = '<!-- ci-sections-start -->';
const REGION_END = '<!-- ci-sections-end -->';

// Render order. Unknown keys (future checks) are appended after these.
const SECTION_ORDER = ['pipeline', 'schema', 'migrations'];

const HEADER = [
  MARKER,
  '## CI Status',
  '',
  'Aggregated CI results, kept here so automated agents (and humans) can read ' +
    'failures without opening the Actions logs. Each check owns one section ' +
    'below and edits it in place — re-runs never add new comments.',
  '',
].join('\n');

function openTag(key) {
  return `<!-- ci-section:${key} -->`;
}
function closeTag(key) {
  return `<!-- /ci-section:${key} -->`;
}

function footerLine(producer) {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const who = producer ? ` Last update: \`${producer}\` at ${stamp}.` : '';
  return `<sub>Maintained by \`.github/scripts/ci-failure-capture\`.${who}</sub>`;
}

function emptyBody(producer) {
  return [
    HEADER,
    REGION_START,
    REGION_END,
    '',
    '---',
    footerLine(producer),
  ].join('\n');
}

/**
 * Parse the section region into an ordered list of { key, content }.
 * Returns null when the body has no section region (e.g. a legacy flat comment).
 */
function parseSections(body) {
  const startIdx = body.indexOf(REGION_START);
  const endIdx = body.indexOf(REGION_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;

  const region = body.slice(startIdx + REGION_START.length, endIdx);
  const sections = [];
  const re =
    /<!-- ci-section:([\w-]+) -->\n?([\s\S]*?)\n?<!-- \/ci-section:\1 -->/g;
  let m;
  while ((m = re.exec(region)) !== null) {
    sections.push({ key: m[1], content: m[2].trim() });
  }
  return sections;
}

function renderRegion(sections) {
  const ordered = [...sections].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.key);
    const bi = SECTION_ORDER.indexOf(b.key);
    return (
      (ai === -1 ? SECTION_ORDER.length : ai) -
      (bi === -1 ? SECTION_ORDER.length : bi)
    );
  });
  const blocks = ordered.map(
    (s) => `${openTag(s.key)}\n${s.content}\n${closeTag(s.key)}`,
  );
  return `${REGION_START}\n${blocks.join('\n\n')}\n${REGION_END}`;
}

function rebuild(body, sections, producer) {
  // If the body lacks a region (absent or legacy flat comment), start fresh
  // from the skeleton so the new sectioned format takes over cleanly.
  const startIdx = body ? body.indexOf(REGION_START) : -1;
  const endIdx = body ? body.indexOf(REGION_END) : -1;
  if (startIdx === -1 || endIdx === -1) {
    const base = emptyBody(producer);
    const bStart = base.indexOf(REGION_START);
    const bEnd = base.indexOf(REGION_END) + REGION_END.length;
    return base.slice(0, bStart) + renderRegion(sections) + base.slice(bEnd);
  }
  const before = body.slice(0, startIdx);
  const after = body.slice(endIdx + REGION_END.length);
  const withRegion = before + renderRegion(sections) + after;
  return setFooter(withRegion, producer);
}

function setFooter(body, producer) {
  const re =
    /<sub>Maintained by `\.github\/scripts\/ci-failure-capture`\.[\s\S]*?<\/sub>/;
  if (re.test(body)) return body.replace(re, footerLine(producer));
  return body;
}

/**
 * Insert or replace the named section. `content` is the section's inner
 * markdown (without the section markers). Returns the new comment body.
 */
function upsertSection(body, key, content, producer) {
  const sections = parseSections(body) || [];
  const next = sections.filter((s) => s.key !== key);
  next.push({ key, content: String(content).trim() });
  return rebuild(body || '', next, producer);
}

/** Remove the named section (e.g. when a previously-failing check now passes). */
function removeSection(body, key, producer) {
  const sections = parseSections(body);
  if (!sections) return body; // nothing to remove
  const next = sections.filter((s) => s.key !== key);
  if (next.length === sections.length) return setFooter(body, producer);
  return rebuild(body, next, producer);
}

async function withRetry(fn, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.status || err.response?.status || 0;
      const secondary =
        status === 403 && /secondary rate limit/i.test(err.message || '');
      if (attempt < retries && (status >= 500 || status === 429 || secondary)) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      } else {
        throw err;
      }
    }
  }
}

async function findComment(github, owner, repo, prNumber) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });
  return comments.find((c) => c.body && c.body.includes(MARKER)) || null;
}

/**
 * Apply a section update to the sticky comment.
 *
 * @param {object} p
 * @param {object} p.github   github-script octokit client
 * @param {object} p.context  github-script context
 * @param {number} p.prNumber
 * @param {string} p.key      section key (e.g. 'pipeline')
 * @param {string|null} p.content  section markdown, or null/'' to remove it
 * @param {string} [p.producer]  short label for the footer (e.g. 'ci-pipeline')
 * @returns {Promise<number|null>} the comment id, or null if nothing to do
 */
async function applySection({
  github,
  context,
  prNumber,
  key,
  content,
  producer,
}) {
  const { owner, repo } = context.repo;
  const remove = content === null || content === undefined || content === '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const existing = await withRetry(() =>
      findComment(github, owner, repo, prNumber),
    );

    // Nothing to remove and no comment yet → no-op.
    if (remove && !existing) return null;

    const base = existing ? existing.body : emptyBody(producer);
    const nextBody = remove
      ? removeSection(base, key, producer)
      : upsertSection(base, key, content, producer);

    let commentId;
    if (existing) {
      if (nextBody === existing.body) return existing.id; // already current
      await withRetry(() =>
        github.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existing.id,
          body: nextBody,
        }),
      );
      commentId = existing.id;
    } else {
      const created = await withRetry(() =>
        github.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: nextBody,
        }),
      );
      commentId = created.data.id;
    }

    // Verify our write survived a possible concurrent update from another
    // check's workflow. If a racing writer clobbered our section, retry.
    const after = await withRetry(() =>
      findComment(github, owner, repo, prNumber),
    );
    const sections = after ? parseSections(after.body) : null;
    const present = sections && sections.some((s) => s.key === key);
    if (remove ? !present : present) return commentId;

    await new Promise((r) =>
      setTimeout(r, 750 + Math.floor(Math.random() * 750)),
    );
  }
  return null;
}

module.exports = {
  MARKER,
  REGION_START,
  REGION_END,
  SECTION_ORDER,
  emptyBody,
  parseSections,
  upsertSection,
  removeSection,
  applySection,
};
