/**
 * Announce a message via the global polite announcer.
 *
 * Use this for non-critical status updates that don't require immediate attention:
 * - Success confirmations ("League created")
 * - Status changes ("Player added to roster")
 * - Navigation updates ("Loaded 10 leagues")
 *
 * For errors or urgent warnings, use `announceAssertive()` instead.
 *
 * @param message - The message to announce to screen reader users
 *
 * @example
 * ```tsx
 * import { announcePolite } from '@/utils/a11y';
 *
 * function handleSave() {
 *   await saveData();
 *   announcePolite('Changes saved successfully');
 * }
 * ```
 *
 * Safe to call from anywhere in the web app. No-op on server-side.
 */
export function announcePolite(message: string) {
  if (typeof window === 'undefined') return;
  const evt = new CustomEvent<string>('app-announce-polite', {
    detail: message,
  });
  window.dispatchEvent(evt);
}

/**
 * Announce a message via the global assertive announcer.
 *
 * Use this for urgent, time-sensitive announcements that should interrupt:
 * - Errors ("Failed to save draft pick")
 * - Urgent state changes ("It's your turn to pick!")
 * - Alerts ("Connection lost")
 *
 * For non-critical updates, use `announcePolite()` instead.
 *
 * @param message - The message to announce immediately to screen reader users
 *
 * @example
 * ```tsx
 * import { announceAssertive } from '@/utils/a11y';
 *
 * function handleError() {
 *   announceAssertive('Error: could not save changes');
 * }
 * ```
 *
 * Safe to call from anywhere in the web app. No-op on server-side.
 */
export function announceAssertive(message: string) {
  if (typeof window === 'undefined') return;
  const evt = new CustomEvent<string>('app-announce-assertive', {
    detail: message,
  });
  window.dispatchEvent(evt);
}
