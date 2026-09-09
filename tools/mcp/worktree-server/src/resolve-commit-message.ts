// Matches a `Co-Authored-By:` or `Claude-Session:` trailer line already
// present in a caller-supplied commit message (e.g. a CCR session's custom
// `Co-Authored-By: Claude Sonnet 5 <...>` + `Claude-Session:` pair), so
// worktree_commit can skip its own generic auto-append instead of producing
// two conflicting/duplicate Co-Authored-By trailers.
const EXISTING_TRAILER_RE = /^(Co-Authored-By|Claude-Session):/im;

export interface ResolveCommitMessageOptions {
  // Caller-provided opt-out of the auto-appended trailer, independent of
  // whether the message happens to already contain one.
  skipAutoTrailer?: boolean;
}

// Builds the final commit message worktree_commit writes to disk: the
// caller's message plus the generic `Co-Authored-By: Claude
// <noreply@anthropic.com>` trailer — unless `skipAutoTrailer` is set or the
// message already carries its own `Co-Authored-By:` / `Claude-Session:`
// trailer, in which case the message is returned unchanged. Does not trim —
// callers preserve whatever trimming behavior they already had at each call
// site so this is purely additive.
export function resolveCommitMessage(
  message: string,
  opts: ResolveCommitMessageOptions = {},
): string {
  if (opts.skipAutoTrailer || EXISTING_TRAILER_RE.test(message)) {
    return message;
  }
  return message + '\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
}
