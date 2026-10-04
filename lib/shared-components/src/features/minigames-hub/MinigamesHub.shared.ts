/**
 * Game catalog shared by `MinigamesHub.tsx` (one breakpoint-driven component
 * for both web and native as of LS-9058) and `GameRoomScreen.tsx`, so the
 * layouts can't drift on copy, ordering, or ids (LS-8669 review).
 *
 * Icons are resolved through the platform-split `GameRoomGlyph`
 * (`GameRoomGlyphs.tsx` / `.native.tsx`), so each template carries an
 * `iconKind` discriminator rather than a rendered icon — callers map it to a
 * glyph name.
 */

import type { ReactNode } from 'react';
import { DISCLOSURE_MIN_CLUES, formatDraftDate } from '@legacy-sports/utils';

export type MinigameId =
  | 'season-draft'
  | 'disclosure'
  | 'twenty-questions'
  | 'mock-draft';

/**
 * One kind per game (LS-8800). `draft` and `stats` predate the Game Room
 * redesign; `quiz` was split out of `stats` so 20 Questions can carry its own
 * mark instead of reusing Who Am I?'s bar chart.
 *
 * Splitting the kind is deliberately behaviour-neutral for `MinigamesHub`:
 * it maps with `kind === 'draft' ? 'clipboard' : 'barChart'`, so `quiz` falls
 * through to the same stats mark it rendered before. Only `GameRoomScreen`
 * distinguishes all three.
 *
 * `mockDraft` (LS-9510) is a distinct kind from `draft` — despite sharing the
 * clipboard glyph with Season Draft — so `GAME_TEMPLATES` keeps one icon kind
 * per game.
 */
export type MinigameIconKind = 'draft' | 'stats' | 'quiz' | 'mockDraft';

export interface MinigameStat {
  label: string;
  value: string;
  /** Optional secondary line under the stat — e.g. when the next free mock
   *  draft opens (LS-10455). */
  note?: string;
}

/** Whether a compact stat chip reads as a personal achievement or a balance. */
export type MinigameStatTone = 'gold' | 'neutral';

export interface MinigameCompactStat {
  /** Short uppercase label — `ACTIVE`, `BEST`, `TOKENS`. */
  label: string;
  value: string;
  tone: MinigameStatTone;
  /** Optional secondary line shown under the row's tag (LS-10455). */
  note?: string;
}

export interface MinigameTemplate {
  id: MinigameId;
  title: string;
  tag: string;
  desc: string;
  accent: 'navy' | 'seam';
  iconKind: MinigameIconKind;
  meta: string[];
  cta: string;
}

export interface MinigamesHubProps {
  onNavigate: (gameId: MinigameId) => void;
  /** Override the narrow-viewport detection — pass the result of useWindowDimensions on native. */
  isNarrow?: boolean;
  /**
   * Optional content rendered between the hero and the game cards — the web
   * hub passes its "Resume your mock draft" banner here (LS-10465).
   */
  banner?: ReactNode;
}

export const GAME_TEMPLATES: MinigameTemplate[] = [
  {
    id: 'season-draft',
    title: 'Season Draft',
    tag: 'Multiplayer · 2–6 players',
    desc: 'Draft hitters or pitchers across eras. Pick the right season, fill your roster, rack up the counting stats. Last one standing with the biggest number wins.',
    accent: 'navy',
    iconKind: 'draft',
    meta: ['Pick your stat: HR · SO · RBI · W', 'Season or Career w/ Team'],
    cta: 'Enter Lobby',
  },
  {
    id: 'disclosure',
    title: 'Who Am I?',
    tag: 'Solo · 2–3 min',
    desc: 'Clues drop one at a time — birthplace, era, quirks, milestones. Name the player with the fewest clues revealed for a higher score.',
    accent: 'seam',
    iconKind: 'stats',
    meta: [
      `${DISCLOSURE_MIN_CLUES}+ clues per player`,
      'Hall of Famers to deep cuts',
    ],
    cta: 'Play Now',
  },
  {
    id: 'twenty-questions',
    title: '20 Questions',
    tag: 'Solo · 3–5 min',
    desc: 'Ask up to 20 yes/no questions to identify the mystery player. Fewer questions = more tokens. Pick your difficulty and start swinging.',
    accent: 'navy',
    iconKind: 'quiz',
    meta: ['Up to 20 questions', 'Easy · Medium · Hard'],
    cta: 'Play Now',
  },
  {
    id: 'mock-draft',
    title: 'Mock Draft',
    tag: 'Solo · Practice vs. AI',
    desc: 'Run a full draft against AI opponents to test strategies and rankings before the real thing — nothing here touches your real leagues.',
    accent: 'navy',
    iconKind: 'mockDraft',
    meta: ['4–12 teams · Snake or Linear', 'All MLB · NL Only · AL Only'],
    cta: 'Start Draft',
  },
];

/** `—` while a stat is loading or its query errored, so the user can tell an
 *  unknown value apart from a real zero. */
export const STAT_PLACEHOLDER = '—';

function statValue(n: number | null): string {
  return n !== null ? String(n) : STAT_PLACEHOLDER;
}

/** Shown in place of a drafts-left count for users with the
 *  unlimited_mock_drafts entitlement (LS-10463). */
export const UNLIMITED_STAT = '∞';

function mockDraftsValue(remaining: number | null, unlimited?: boolean) {
  return unlimited === true ? UNLIMITED_STAT : statValue(remaining);
}

/**
 * "Next free draft Oct 9, 8:00 PM" once the free weekly allowance is used up
 * (LS-10455), so a bare "0 Drafts Left" explains when it refills. Rendered in
 * the viewer's local time zone via `formatDraftDate`. Undefined while drafts
 * remain, or when the reset time is unknown/unparseable.
 */
export function mockDraftResetNote(
  remaining: number | null,
  resetsAt: string | null,
): string | undefined {
  if (remaining !== 0) return undefined;
  const when = formatDraftDate(resetsAt);
  return when ? `Next free draft ${when}` : undefined;
}

/** Shared stat-selection logic — identical business rules on both platforms. */
export function statFor(
  id: MinigameId,
  args: {
    activeGamesCount: number | null;
    bestScore: number | null;
    mockDraftsRemaining: number | null;
    /** True for premium users — the weekly cap does not apply. */
    mockDraftsUnlimited?: boolean;
    mockDraftsResetAt?: string | null;
  },
): MinigameStat {
  switch (id) {
    case 'season-draft':
      return {
        label: 'Games Active',
        value: statValue(args.activeGamesCount),
      };
    case 'disclosure':
      return { label: 'Your Best', value: statValue(args.bestScore) };
    case 'twenty-questions':
      return { label: 'Questions', value: '20' };
    case 'mock-draft':
      return {
        label: 'Drafts Left',
        value: mockDraftsValue(
          args.mockDraftsRemaining,
          args.mockDraftsUnlimited,
        ),
        note: mockDraftResetNote(
          args.mockDraftsRemaining,
          args.mockDraftsResetAt ?? null,
        ),
      };
  }
}

/**
 * Compact `label + value` stat for the Game Room row chips (LS-8800).
 *
 * A sibling of `statFor` rather than a replacement: `statFor` feeds the two
 * existing hubs' large stat blocks (`Games Active` / `Your Best` /
 * `Questions`), whose copy and layout are unchanged by this redesign. The
 * Game Room chips need shorter labels, a tone, and a token balance `statFor`
 * has no argument for.
 */
export function compactStatFor(
  id: MinigameId,
  args: {
    activeGamesCount: number | null;
    bestScore: number | null;
    tokens: number | null;
    mockDraftsRemaining: number | null;
    /** True for premium users — the weekly cap does not apply. */
    mockDraftsUnlimited?: boolean;
    mockDraftsResetAt?: string | null;
  },
): MinigameCompactStat {
  switch (id) {
    case 'season-draft':
      return {
        label: 'Active',
        value: statValue(args.activeGamesCount),
        tone: 'gold',
      };
    case 'disclosure':
      return {
        label: 'Best',
        value: statValue(args.bestScore),
        tone: 'gold',
      };
    case 'twenty-questions':
      return {
        label: 'Tokens',
        value: statValue(args.tokens),
        tone: 'neutral',
      };
    case 'mock-draft':
      return {
        label: 'Left',
        value: mockDraftsValue(
          args.mockDraftsRemaining,
          args.mockDraftsUnlimited,
        ),
        tone: 'neutral',
        note: mockDraftResetNote(
          args.mockDraftsRemaining,
          args.mockDraftsResetAt ?? null,
        ),
      };
  }
}
