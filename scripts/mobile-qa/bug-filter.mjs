// Mobile QA bug filter — deduplicates AI judge findings across flow steps and
// builds Jira-ready descriptions. Ported from ai-qa-agent/src/agent/bugFilter.ts,
// adapted for mobile: the dedup unit is a screen (QA-coverage page slug derived
// from the artifact path) instead of a web route, and flow-error evidence
// replaces network/console evidence.
//
// Three passes (thresholds preserved from the original):
//   1. Fingerprint  — exact-match on flow-error key or category+normalized title
//   2. Semantic     — Jaccard similarity >= 0.40 on tokenized title+description,
//                     union-find clustering, highest confidence wins per cluster
//   3. Cat+screen   — same category AND >50% screen overlap AND title Jaccard
//                     >= 0.25 → keep the higher-ranked finding
//
// Usage (from repo root, after judge.mjs wrote findings JSON files):
//   node scripts/mobile-qa/bug-filter.mjs --in maestro/artifacts/findings \
//     [--out maestro/artifacts/report.json] [--min-confidence 0.6]
//
// Input:  a directory of judge.mjs output files (*.json).
// Output: { candidates, deduped, filable } where each filable entry carries a
// `jiraDescription` in Jira wiki markup, ready for jira_create_ticket — see
// .agents/skills/mobile-qa/references/jira-filing.md for the filing hierarchy.
//
// Dependency-free by design (node: builtins only) so it runs without node_modules.

import fs from 'node:fs/promises';
import path from 'node:path';

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'ought',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'just',
  'because',
  'if',
  'when',
  'while',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'screen',
  'flow',
]);

// ── Loading ──

function parseArgs(argv) {
  const args = { minConfidence: 0.6 };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => argv[++i];
    switch (flag) {
      case '--in':
        args.in = next();
        break;
      case '--out':
        args.out = next();
        break;
      case '--min-confidence':
        args.minConfidence = Number.parseFloat(next());
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!args.in) throw new Error('--in <findings dir> is required');
  if (!Number.isFinite(args.minConfidence))
    throw new Error('--min-confidence must be a number');
  return args;
}

/** Derive the QA-coverage screen slug from a judge output (step name or screenshot path). */
function screenOf(finding) {
  const source = finding.stepName || finding.screenshots?.[0] || 'unknown';
  const normalized = source.replace(/\\/g, '/');
  const match = normalized.match(/(?:artifacts\/)?([a-z0-9-]+)\//i);
  return match ? match[1] : normalized.split('/')[0];
}

async function loadCandidates(dir) {
  const entries = await fs.readdir(dir);
  const candidates = [];
  for (const entry of entries.filter((e) => e.endsWith('.json')).sort()) {
    const filePath = path.join(dir, entry);
    const finding = JSON.parse(await fs.readFile(filePath, 'utf8'));
    for (const issue of finding.issues || []) {
      candidates.push({
        issue,
        screen: screenOf(finding),
        stepName: finding.stepName || entry,
        flow: finding.flow || null,
        screenshotPath: finding.screenshots?.[0] || null,
        evidenceSummary: finding.pageSummary || '',
        flowErrors: finding.flowErrors || [],
      });
    }
  }
  return candidates;
}

// ── Pass 1: fingerprint dedup ──

function buildFingerprint(c) {
  if (c.flowErrors?.length && c.issue.category === 'functional') {
    const normalized = String(c.flowErrors[0])
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 120);
    return `flowerr:${normalized}`;
  }
  const normTitle = c.issue.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 80);
  return `${c.issue.category}:${normTitle}`;
}

function fingerprintDedup(candidates) {
  const buckets = new Map();
  for (const c of candidates) {
    const key = buildFingerprint(c);
    const existing = buckets.get(key);
    if (!existing) {
      c.affectedScreens = [c.screen];
      buckets.set(key, c);
    } else {
      if (!existing.affectedScreens)
        existing.affectedScreens = [existing.screen];
      if (!existing.affectedScreens.includes(c.screen))
        existing.affectedScreens.push(c.screen);
      if (c.issue.confidence > existing.issue.confidence) {
        c.affectedScreens = existing.affectedScreens;
        if (!c.affectedScreens.includes(c.screen))
          c.affectedScreens.push(c.screen);
        buckets.set(key, c);
      }
    }
  }
  return Array.from(buckets.values());
}

// ── Pass 2: semantic clustering ──

function tokenize(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  return new Set(words.filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const unionSize = a.size + b.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

function severityWeight(s) {
  switch (s) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function semanticCluster(candidates, threshold) {
  const tokenSets = candidates.map((c) =>
    tokenize(c.issue.title + ' ' + c.issue.description),
  );

  const parent = candidates.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (candidates[i].issue.category !== candidates[j].issue.category)
        continue;
      if (jaccard(tokenSets[i], tokenSets[j]) >= threshold) union(i, j);
    }
  }

  const clusters = new Map();
  for (let i = 0; i < candidates.length; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  }

  const result = [];
  for (const members of clusters.values()) {
    members.sort((a, b) => {
      const ca = candidates[a],
        cb = candidates[b];
      const confDiff = cb.issue.confidence - ca.issue.confidence;
      if (Math.abs(confDiff) > 0.05) return confDiff;
      return (
        severityWeight(cb.issue.severity) - severityWeight(ca.issue.severity)
      );
    });

    const best = { ...candidates[members[0]] };
    const allScreens = new Set(best.affectedScreens || [best.screen]);
    for (const idx of members) {
      const c = candidates[idx];
      for (const s of c.affectedScreens || [c.screen]) allScreens.add(s);
    }
    best.affectedScreens = Array.from(allScreens);

    // Observed on 3+ screens → slightly boost confidence (real-bug signal)
    if (allScreens.size >= 3) {
      best.issue = {
        ...best.issue,
        confidence: Math.min(1, best.issue.confidence + 0.05),
      };
    }
    result.push(best);
  }
  return result;
}

// ── Pass 3: category + screen-overlap merge ──

function rankPair(candidates, i, j) {
  const ci = candidates[i],
    cj = candidates[j];
  const scoreDiff =
    cj.issue.confidence +
    severityWeight(cj.issue.severity) / 4 -
    (ci.issue.confidence + severityWeight(ci.issue.severity) / 4);
  return scoreDiff > 0 ? [j, i] : [i, j];
}

function categoryScreenMerge(candidates) {
  const removed = new Set();
  for (let i = 0; i < candidates.length; i++) {
    if (removed.has(i)) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      if (removed.has(j)) continue;
      if (candidates[i].issue.category !== candidates[j].issue.category)
        continue;

      const screensA = new Set(
        candidates[i].affectedScreens || [candidates[i].screen],
      );
      const screensB = new Set(
        candidates[j].affectedScreens || [candidates[j].screen],
      );
      const overlap = [...screensA].filter((s) => screensB.has(s)).length;
      const smaller = Math.min(screensA.size, screensB.size);
      if (smaller === 0 || overlap / smaller <= 0.5) continue;

      const simScore = jaccard(
        tokenize(candidates[i].issue.title),
        tokenize(candidates[j].issue.title),
      );
      if (simScore < 0.25) continue; // genuinely different bugs in the same category

      const [keep, drop] = rankPair(candidates, i, j);
      const keepScreens = new Set(
        candidates[keep].affectedScreens || [candidates[keep].screen],
      );
      for (const s of candidates[drop].affectedScreens || [
        candidates[drop].screen,
      ])
        keepScreens.add(s);
      candidates[keep].affectedScreens = Array.from(keepScreens);
      removed.add(drop);
    }
  }
  return candidates.filter((_, i) => !removed.has(i));
}

// ── Jira description (wiki markup, matches the QA coverage model) ──

export function buildJiraDescription(candidate) {
  const screens = candidate.affectedScreens?.length
    ? candidate.affectedScreens
    : [candidate.screen];
  const sections = [
    `*Affected Screens (${screens.length}):*`,
    ...screens.map((s) => `- ${s}`),
    '',
    `Category: ${candidate.issue.category}`,
    `Severity: ${candidate.issue.severity}`,
    `Confidence: ${(candidate.issue.confidence * 100).toFixed(0)}%`,
    `Platform: android (Maestro flow${candidate.flow ? ` \`${candidate.flow}\`` : ''})`,
    '',
    'h3. Description',
    candidate.issue.description,
    '',
    'h3. Expected Behavior',
    candidate.issue.expectedBehavior,
    '',
    'h3. Actual Behavior',
    candidate.issue.actualBehavior,
    '',
    'h3. Reproduction Steps',
    ...candidate.issue.reproductionSteps.map((s, i) => `${i + 1}. ${s}`),
  ];

  if (candidate.flowErrors?.length) {
    sections.push('', 'h3. Maestro Flow Errors');
    for (const err of candidate.flowErrors.slice(0, 10))
      sections.push(`- ${err}`);
  }
  if (candidate.screenshotPath) {
    sections.push(
      '',
      'h3. Evidence',
      `Screenshot: ${candidate.screenshotPath}`,
    );
    if (candidate.evidenceSummary) sections.push(candidate.evidenceSummary);
  } else if (candidate.evidenceSummary) {
    sections.push('', 'h3. Evidence', candidate.evidenceSummary);
  }
  return sections.join('\n');
}

export function deduplicateBugs(candidates) {
  if (candidates.length === 0) return [];
  const fingerprinted = fingerprintDedup(candidates);
  console.log(
    `  dedup pass 1 (fingerprint): ${candidates.length} -> ${fingerprinted.length}`,
  );
  const clustered = semanticCluster(fingerprinted, 0.4);
  console.log(
    `  dedup pass 2 (semantic):    ${fingerprinted.length} -> ${clustered.length}`,
  );
  const merged = categoryScreenMerge(clustered);
  console.log(
    `  dedup pass 3 (cat+screen):  ${clustered.length} -> ${merged.length}`,
  );
  return merged;
}

async function main() {
  const args = parseArgs(process.argv);
  const candidates = await loadCandidates(args.in);
  const deduped = deduplicateBugs(candidates);
  const filable = deduped
    .filter((c) => c.issue.confidence >= args.minConfidence)
    .sort(
      (a, b) =>
        severityWeight(b.issue.severity) - severityWeight(a.issue.severity) ||
        b.issue.confidence - a.issue.confidence,
    )
    .map((c) => ({ ...c, jiraDescription: buildJiraDescription(c) }));

  const report = {
    generatedFrom: args.in,
    minConfidence: args.minConfidence,
    counts: {
      candidates: candidates.length,
      deduped: deduped.length,
      filable: filable.length,
    },
    filable,
    belowThreshold: deduped.filter(
      (c) => c.issue.confidence < args.minConfidence,
    ),
  };

  const serialized = JSON.stringify(report, null, 2);
  if (args.out) {
    await fs.mkdir(path.dirname(args.out), { recursive: true });
    await fs.writeFile(args.out, serialized + '\n', 'utf8');
    console.log(
      `Report: ${candidates.length} candidate(s) -> ${deduped.length} deduped -> ${filable.length} filable. Wrote ${args.out}`,
    );
  } else {
    console.log(serialized);
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
