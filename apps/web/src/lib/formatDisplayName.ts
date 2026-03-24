/** Strip email domain from username display. Only strips if the value looks like an email address. */
export function formatDisplayName(username: string): string {
  // Only strip domain if it looks like an email (contains @ with text on both sides and a dot after @)
  if (/^[^@]+@[^@]+\.[^@]+$/.test(username)) {
    return username.split('@')[0];
  }
  return username;
}
