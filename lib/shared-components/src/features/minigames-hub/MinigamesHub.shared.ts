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

export type MinigameId = 'season-draft' | 'disclosure' | 'twenty-questions';

/**
 * One kind per game (LS-8800). `draft` and `stats` predate the Game Room
 * redesign; `quiz` was split out of `stats` so 20 Questions can carry its own
 * mark instead of reusing Who Am I?'s bar chart.
 *
 * Splitting the kind is deliberately behaviour-neutral for `MinigamesHub`:
 * it maps with `kind === 'draft' ? 'clipboard' : 'barChart'`, so `quiz` falls
 * through to the same stats mark it rendered before. Only `GameRoomScreen`
 * distinguishes all three.
 */
export type MinigameIconKind = 'draft' | 'stats' | 'quiz';

export interface MinigameStat {
  label: string;
  value: string;
}

/** Whether a compact stat chip reads as a personal achievement or a balance. */
export type MinigameStatTone = 'gold' | 'neutral';

export interface MinigameCompactStat {
  /** Short uppercase label — `ACTIVE`, `BEST`, `TOKENS`. */
  label: string;
  value: string;
  tone: MinigameStatTone;
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
}

export const GAME_TEMPLATES: MinigameTemplate[] = [
  {
    id: 'season-draft',
    title: 'Season Draft',
    tag: 'Multiplayer · 2–6 players',
    desc: 'Draft hitters or pitchers across eras. Pick the right season, fill your roster, rack up the counting stats. Last one standing with the biggest number wins.',
    accent: 'navy',
    iconKind: 'draft',
    meta: ['Pick your stat: HR · SO · RBI · W', 'Season or Career-w/-Team'],
    cta: 'Enter Lobby',
  },
  {
    id: 'disclosure',
    title: 'Who Am I?',
    tag: 'Solo · 2–3 min',
    desc: 'Clues drop one at a time — birthplace, era, quirks, milestones. Name the player with the fewest clues revealed for a higher score.',
    accent: 'seam',
    iconKind: 'stats',
    meta: ['7 clues per player', 'Hall of Famers to deep cuts'],
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
];

/** `—` while a stat is loading or its query errored, so the user can tell an
 *  unknown value apart from a real zero. */
export const STAT_PLACEHOLDER = '—';

function statValue(n: number | null): string {
  return n !== null ? String(n) : STAT_PLACEHOLDER;
}

/** Shared stat-selection logic — identical business rules on both platforms. */
export function statFor(
  id: MinigameId,
  args: { activeGamesCount: number | null; bestScore: number | null },
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
  }
}
