/**
 * Formats an ISO timestamp for draft scheduling display.
 * Returns a locale-aware string like "Apr 20, 8:00 PM", or a
 * locale-independent "YYYY-MM-DD HH:MM" if locale formatting is
 * unavailable (e.g. a Hermes release build without full ICU/Intl data).
 * Returns an empty string for null/undefined/invalid input.
 *
 * Lives in its own module (rather than inline in `index.ts`) so all three
 * package barrels can re-export it — `index.ts` (web/node), `mobile.ts`
 * (what Metro resolves via the package "react-native" field) and
 * `index.native.ts` (what apps/app jest resolves). Defining it only in
 * `index.ts` made it `undefined` on device, so the Home dashboard's
 * `LeagueListRow` crashed with "undefined is not a function" (LS-8755).
 */
export function formatDraftDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return (
      d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }) +
      ', ' +
      d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    );
  } catch {
    // Hermes release builds without full ICU/Intl data can leave
    // toLocaleDateString/toLocaleTimeString undefined, throwing here.
    // Use local getters so the fallback stays in the user's time zone (LS-10471).
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
