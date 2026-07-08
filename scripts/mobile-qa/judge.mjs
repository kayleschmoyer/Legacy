// Mobile QA visual judge — sends Maestro screenshots to an AI vision model and
// returns structured bug findings. Ported from ai-qa-agent/src/ai/judge.ts,
// adapted for mobile: input is one or more emulator screenshots (before/after
// pairs from a Maestro flow step) instead of a Playwright DOM snapshot.
//
// Providers: anthropic (default) or openai-compatible.
//   QA_AI_PROVIDER=anthropic|openai-compatible
//   anthropic:         ANTHROPIC_API_KEY, ANTHROPIC_QA_MODEL (default claude-sonnet-5)
//   openai-compatible: QA_OPENAI_COMPAT_API_KEY, QA_OPENAI_COMPAT_BASE_URL, QA_COMPAT_MODEL
//
// Usage (from repo root):
//   node scripts/mobile-qa/judge.mjs --step "trade-center/03-after-propose-trade" \
//     --screenshot maestro/artifacts/trade-center/02-before-propose-trade.png \
//     --screenshot maestro/artifacts/trade-center/03-after-propose-trade-team-step.png \
//     [--flow maestro/flows/trade-center/trade-center.yaml] [--errors "<maestro stderr>"] \
//     [--out maestro/artifacts/findings/trade-center-03.json]
//
// Output: JSON { stepName, flow, screenshots, pageSummary, issues[], nextActions[] }
// where each issue matches the shape documented in
// .agents/skills/mobile-qa/references/visual-judge.md.
//
// Dependency-free by design (node: builtins only) so it runs without node_modules.

import fs from 'node:fs/promises';
import path from 'node:path';

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const CATEGORIES = [
  'ui',
  'ux',
  'functional',
  'content',
  'accessibility',
  'performance',
  'navigation',
  'consistency',
  'other',
];

function parseArgs(argv) {
  const args = { screenshots: [], errors: [] };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => argv[++i];
    switch (flag) {
      case '--step':
        args.step = next();
        break;
      case '--screenshot':
        args.screenshots.push(next());
        break;
      case '--flow':
        args.flow = next();
        break;
      case '--errors':
        args.errors.push(next());
        break;
      case '--out':
        args.out = next();
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!args.step) throw new Error('--step is required');
  if (args.screenshots.length === 0)
    throw new Error('at least one --screenshot is required');
  return args;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getProvider() {
  const raw = (process.env.QA_AI_PROVIDER || 'anthropic').trim().toLowerCase();
  if (raw === 'anthropic' || raw === 'openai-compatible') return raw;
  throw new Error(
    `Unsupported QA_AI_PROVIDER "${raw}". Supported values: anthropic, openai-compatible.`,
  );
}

function getModel(provider) {
  const specific =
    provider === 'anthropic'
      ? process.env.ANTHROPIC_QA_MODEL?.trim()
      : process.env.QA_COMPAT_MODEL?.trim();
  return (
    specific ||
    process.env.QA_MODEL?.trim() ||
    (provider === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o')
  );
}

function buildInstruction(input) {
  return (
    `You are a senior mobile QA analyst auditing an Android build of the Legacy Sports ` +
    `fantasy app (Expo/React Native, Tamagui UI). You are given ${input.screenshots.length} ` +
    `emulator screenshot(s) from one Maestro flow step — when two are provided they are a ` +
    `BEFORE/AFTER pair around a single interaction.\n\n` +
    `RULES:\n` +
    `- Only report issues with CONCRETE evidence visible in the screenshots or flow errors.\n` +
    `- Do NOT invent bugs, speculate, or report cosmetic preferences.\n` +
    `- Do NOT report the same issue more than once, even if it appears in multiple elements.\n` +
    `- Each title MUST follow the pattern: "[CATEGORY] Specific defect on <element/area>"\n` +
    `  Examples: "[ui] Roster section header clipped on roster tab",\n` +
    `            "[functional] Propose Trade dialog fails to advance after team selection",\n` +
    `            "[content] Placeholder text shown in matchup score card"\n` +
    `- Use EXACTLY the same title if the same root-cause issue appears on different screens.\n` +
    `- Focus on what a REAL USER on a phone would notice: broken flows, error states,\n` +
    `  missing data, unreadable/truncated/overlapping text, elements cut off by the\n` +
    `  keyboard or safe-area insets, touch targets that clearly did nothing (before/after\n` +
    `  identical when a state change was expected), spinners that never resolved.\n` +
    `- Mobile-specific checks: safe-area/notch overlap, tab bar occlusion, text truncation\n` +
    `  at narrow widths, low-contrast text, dark-mode artifacts, stretched/missing images.\n` +
    `- Assign confidence 0.8-1.0 only for direct visual evidence (error text, blank screen).\n` +
    `- Assign confidence 0.5-0.7 for likely issues inferred from indirect evidence.\n` +
    `- Assign confidence below 0.5 for speculative or minor issues.\n` +
    `- Limit to at most 5 issues per analysis. Report only the most impactful.\n\n` +
    `Return valid JSON matching this shape:\n\n` +
    `{\n` +
    `  "pageSummary": string,\n` +
    `  "issues": [\n` +
    `    {\n` +
    `      "severity": "low" | "medium" | "high" | "critical",\n` +
    `      "category": "ui" | "ux" | "functional" | "content" | "accessibility" | "performance" | "navigation" | "consistency" | "other",\n` +
    `      "title": string,\n` +
    `      "description": string,\n` +
    `      "expectedBehavior": string,\n` +
    `      "actualBehavior": string,\n` +
    `      "reproductionSteps": string[],\n` +
    `      "confidence": number\n` +
    `    }\n` +
    `  ],\n` +
    `  "nextActions": string[]\n` +
    `}\n\n` +
    `Current step: ${input.step}\n` +
    `Maestro flow: ${input.flow || 'unknown'}\n` +
    `Flow errors: ${JSON.stringify(input.errors)}\n` +
    `Screenshots (in order): ${input.screenshots.map((s) => path.basename(s)).join(', ')}`
  );
}

function extractJsonBlock(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Model response did not contain valid JSON.');
  }
}

function normalizeConfidence(value) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : NaN;
  if (!Number.isFinite(numeric)) return 0.5;
  if (numeric > 1 && numeric <= 100) return numeric / 100;
  return Math.min(1, Math.max(0, numeric));
}

function validateJudgeResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Judge response is not an object.');
  }
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const validated = issues.map((issue, i) => {
    if (!issue || typeof issue !== 'object') {
      throw new Error(`issues[${i}] is not an object.`);
    }
    const severity = SEVERITIES.includes(issue.severity)
      ? issue.severity
      : 'low';
    const category = CATEGORIES.includes(issue.category)
      ? issue.category
      : 'other';
    for (const field of [
      'title',
      'description',
      'expectedBehavior',
      'actualBehavior',
    ]) {
      if (typeof issue[field] !== 'string' || !issue[field].trim()) {
        throw new Error(`issues[${i}].${field} is missing or empty.`);
      }
    }
    const reproductionSteps = Array.isArray(issue.reproductionSteps)
      ? issue.reproductionSteps.filter((s) => typeof s === 'string' && s.trim())
      : [];
    if (reproductionSteps.length === 0) {
      throw new Error(
        `issues[${i}].reproductionSteps must contain at least one step.`,
      );
    }
    return {
      severity,
      category,
      title: issue.title,
      description: issue.description,
      expectedBehavior: issue.expectedBehavior,
      actualBehavior: issue.actualBehavior,
      reproductionSteps,
      confidence: normalizeConfidence(issue.confidence),
    };
  });
  return {
    pageSummary:
      typeof parsed.pageSummary === 'string' ? parsed.pageSummary : '',
    issues: validated,
    nextActions: Array.isArray(parsed.nextActions)
      ? parsed.nextActions.filter((a) => typeof a === 'string')
      : [],
  };
}

async function readImagesBase64(paths) {
  return Promise.all(
    paths.map(async (p) => {
      const bytes = await fs.readFile(p);
      return bytes.toString('base64');
    }),
  );
}

async function judgeWithAnthropic(input, model) {
  const apiKey = requiredEnv('ANTHROPIC_API_KEY');
  const images = await readImagesBase64(input.screenshots);
  const content = [
    { type: 'text', text: buildInstruction(input) },
    ...images.map((data) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data },
    })),
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${body}`);
  }

  const body = await response.json();
  const raw = (body.content || [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
  return validateJudgeResponse(extractJsonBlock(raw));
}

async function judgeWithOpenAiCompatible(input, model) {
  const apiKey = requiredEnv('QA_OPENAI_COMPAT_API_KEY');
  const baseUrl = requiredEnv('QA_OPENAI_COMPAT_BASE_URL').replace(/\/$/, '');
  const images = await readImagesBase64(input.screenshots);
  const content = [
    { type: 'text', text: buildInstruction(input) },
    ...images.map((data) => ({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${data}` },
    })),
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenAI-compatible request failed (${response.status}): ${body}`,
    );
  }

  const body = await response.json();
  const raw = body.choices?.[0]?.message?.content || '';
  return validateJudgeResponse(extractJsonBlock(raw));
}

async function main() {
  const args = parseArgs(process.argv);
  const provider = getProvider();
  const model = getModel(provider);

  const judgment =
    provider === 'anthropic'
      ? await judgeWithAnthropic(args, model)
      : await judgeWithOpenAiCompatible(args, model);

  const result = {
    stepName: args.step,
    flow: args.flow || null,
    screenshots: args.screenshots,
    flowErrors: args.errors,
    ...judgment,
  };

  const serialized = JSON.stringify(result, null, 2);
  if (args.out) {
    await fs.mkdir(path.dirname(args.out), { recursive: true });
    await fs.writeFile(args.out, serialized + '\n', 'utf8');
    console.log(`Wrote ${result.issues.length} issue(s) to ${args.out}`);
  } else {
    console.log(serialized);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
