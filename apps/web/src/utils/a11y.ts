/**
 * Announce a message via the global polite announcer.
 * Safe to call from anywhere in the web app.
 */
export function announcePolite(message: string) {
  if (typeof window === 'undefined') return;
  const evt = new CustomEvent<string>('app-announce-polite', { detail: message });
  window.dispatchEvent(evt);
}
