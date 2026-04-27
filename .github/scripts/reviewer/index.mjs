import { getPullRequestContext, postShadowComment } from './lib/github.mjs';
import { buildSystemPrompt, buildUserPrompt } from './lib/prompts/system.mjs';

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
      `[reviewer] Failed to fetch PR context: ${err.message}\n`,
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
      `[reviewer] Failed to init provider '${providerName}': ${err.message}\n`,
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
      `[reviewer] Failed to build prompts: ${err.message}\n`,
    );
    process.exit(0);
  }

  // Invoke provider — fail open on infra errors
  let reviewText;
  try {
    reviewText = await provider.review({
      system: systemPrompt,
      user: userPrompt,
    });
  } catch (err) {
    process.stderr.write(`[reviewer] Provider error: ${err.message}\n`);
    process.exit(0);
  }

  // Post shadow comment — fail open on infra errors
  try {
    await postShadowComment(prNumber, reviewText);
    process.stdout.write(
      `[reviewer] Shadow review posted on PR #${prNumber}\n`,
    );
  } catch (err) {
    process.stderr.write(`[reviewer] Failed to post comment: ${err.message}\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  process.stderr.write(`[reviewer] Unexpected error: ${err.message}\n`);
  process.exit(0);
});
