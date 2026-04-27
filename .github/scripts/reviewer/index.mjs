import { getPullRequestContext, postShadowComment } from './lib/github.mjs';
import { buildSystemPrompt, buildUserPrompt } from './lib/prompts/system.mjs';
import { isTrivialPR, runMultiPass } from './lib/multi-pass.mjs';
import { consolidate } from './lib/consolidator.mjs';

async function main() {
  const prNumber = Number(process.env.PR_NUMBER);
  if (!prNumber) {
    process.stderr.write('[reviewer] PR_NUMBER env var is required\n');
    process.exit(1);
  }

  const providerName = process.env.LLM_PROVIDER ?? 'copilot-cli';

  // Fetch PR context — fail open on infra errors
  let ctx;
  try {
    ctx = getPullRequestContext(prNumber);
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to fetch PR context: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(0);
  }

  // Skip conditions
  if (ctx.isDraft) {
    process.stdout.write('[reviewer] Skipping: draft PR\n');
    return;
  }
  if (ctx.isCrossRepository) {
    process.stdout.write('[reviewer] Skipping: fork PR\n');
    return;
  }
  // Prefer the explicit is_bot flag; fall back to the [bot] login suffix convention.
  const isBot =
    ctx.author?.is_bot ?? ctx.author?.login?.endsWith('[bot]') ?? false;
  if (!isBot) {
    process.stdout.write('[reviewer] Skipping: non-bot author\n');
    return;
  }

  // Dynamic imports so module resolution doesn't fail when dependency PRs
  // (T7 CopilotCLIProvider, T8 AnthropicProvider) haven't merged yet.
  let provider;
  try {
    if (providerName === 'anthropic') {
      const { AnthropicProvider } =
        await import('./lib/providers/anthropic.mjs');
      provider = new AnthropicProvider();
    } else {
      const { CopilotCLIProvider } =
        await import('./lib/providers/copilot-cli.mjs');
      provider = new CopilotCLIProvider();
    }
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to init provider '${providerName}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(0);
  }

  // Build prompts — fail open on infra errors (e.g. missing reviewer-rules.md)
  let systemPrompt, userPrompt;
  try {
    systemPrompt = buildSystemPrompt();
    userPrompt = buildUserPrompt(ctx);
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to build prompts: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(0);
  }

  // Decide between single-pass and multi-pass based on diff size / sensitive paths
  const diff = typeof ctx.diff === 'string' ? ctx.diff : '';
  if (!diff.trim()) {
    process.stdout.write(
      '[reviewer] Skipping: no diff available (failed or empty diff must not be treated as trivial)\n',
    );
    return;
  }
  const trivial = isTrivialPR(diff);
  let reviewText;

  if (trivial) {
    process.stdout.write(
      '[reviewer] Trivial PR — running single-pass review\n',
    );
    try {
      reviewText = (
        await provider.review({
          system: systemPrompt,
          user: userPrompt,
        })
      ).text;
    } catch (err) {
      process.stderr.write(
        `[reviewer] Provider error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(0);
    }
  } else {
    process.stdout.write(
      '[reviewer] Non-trivial PR — running multi-pass review (correctness → security → contract)\n',
    );
    try {
      const passResults = await runMultiPass(
        provider,
        systemPrompt,
        userPrompt,
      );
      reviewText = consolidate(passResults);
    } catch (err) {
      process.stderr.write(
        `[reviewer] Multi-pass error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(0);
    }
  }

  // GitHub issue comment body limit is 65,536 chars. Truncate with a note so
  // large multi-pass reviews still post rather than silently failing (422).
  const GITHUB_BODY_LIMIT = 60_000;
  if (reviewText.length > GITHUB_BODY_LIMIT) {
    reviewText =
      reviewText.slice(0, GITHUB_BODY_LIMIT) +
      '\n\n_[Review truncated — body exceeded GitHub comment size limit]_';
  }

  // Post shadow comment — fail open on infra errors
  try {
    await postShadowComment(prNumber, reviewText);
    process.stdout.write(
      `[reviewer] Shadow review posted on PR #${prNumber} (${trivial ? 'single' : 'multi'}-pass)\n`,
    );
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to post comment: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(0);
  }
}

main().catch((err) => {
  process.stderr.write(
    `[reviewer] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(0);
});
