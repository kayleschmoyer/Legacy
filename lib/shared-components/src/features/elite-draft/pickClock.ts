// ---------------------------------------------------------------------------
// Shared pick-clock formatting
// ---------------------------------------------------------------------------

/**
 * Formats a remaining-seconds value for a draft pick clock.
 *
 * Slow-mode drafts (a per-pick limit of an hour or more) render with an hours
 * group (`H:MM:SS`) so multi-hour and multi-day windows read correctly; fast
 * drafts render as `M:SS`.
 *
 * Both the header (`DraftTopBand`) and the sidebar (`CircularTimer`) format
 * their clocks through this single helper so the two displays never diverge
 * (LS-8064).
 */
export function formatPickClock(
  seconds: number,
  pickTimeLimitSeconds: number,
): string {
  const secs = seconds % 60;
  const isSlowMode = pickTimeLimitSeconds >= 3600;
  if (isSlowMode) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  const mins = Math.floor(seconds / 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
