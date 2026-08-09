/**
 * Pure @mention helpers for the League Chat Tab (LS-9097).
 *
 * Mentions are resolved against the league's team roster (team name + the
 * managing user's id) rather than raw usernames — `leagueTeams` is already
 * fetched for other league screens and needs no new server query, unlike a
 * per-user roster which would require an N+1 `teamLeagueMembers` fetch.
 */

export interface MentionCandidate {
  userId: number;
  label: string;
}

export interface MessageSegment {
  text: string;
  isMention: boolean;
}

/**
 * Returns the in-progress mention token (the text after the last `@` that
 * starts a word) ending at `cursor`, or `null` if the caret isn't currently
 * inside a mention token (no `@`, or the `@` is mid-word / has a space after it).
 */
export function getMentionQuery(text: string, cursor: number): string | null {
  const upToCursor = text.slice(0, cursor);
  const atIndex = upToCursor.lastIndexOf('@');
  if (atIndex === -1) return null;

  const token = upToCursor.slice(atIndex + 1);
  if (/\s/.test(token)) return null;

  const charBeforeAt = upToCursor[atIndex - 1];
  if (charBeforeAt !== undefined && !/\s/.test(charBeforeAt)) return null;

  return token;
}

/**
 * Replaces the in-progress mention token ending at `cursor` with
 * `@<label> `, returning the new text and the cursor position right after
 * the inserted mention.
 */
export function applyMention(
  text: string,
  cursor: number,
  label: string,
): { text: string; cursor: number } {
  const upToCursor = text.slice(0, cursor);
  const atIndex = upToCursor.lastIndexOf('@');
  if (atIndex === -1) return { text, cursor };

  const inserted = `@${label} `;
  const newText = text.slice(0, atIndex) + inserted + text.slice(cursor);
  return { text: newText, cursor: atIndex + inserted.length };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits message text into plain/mention segments for highlighted
 * rendering. Matches are anchored to known roster labels only — free-text
 * "@whatever" that doesn't match a team in the roster renders as plain text.
 */
export function splitMentions(
  text: string,
  candidateLabels: readonly string[],
): MessageSegment[] {
  if (!text || candidateLabels.length === 0) {
    return [{ text, isMention: false }];
  }

  // Longest-first so a label that's a prefix of another (e.g. "Bears" vs
  // "Bears United") never shadows the longer match.
  const sortedLabels = [...candidateLabels].sort((a, b) => b.length - a.length);
  const pattern = sortedLabels.map(escapeRegExp).join('|');
  const regex = new RegExp(`@(?:${pattern})\\b`, 'g');

  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isMention: false,
      });
    }
    segments.push({ text: match[0], isMention: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMention: false });
  }

  return segments.length > 0 ? segments : [{ text, isMention: false }];
}
