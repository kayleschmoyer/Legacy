/**
 * Game catalog shared between the web (`MinigamesHub.tsx`) and native
 * (`MinigamesHub.native.tsx`) implementations, so the two platforms can't
 * drift on copy, ordering, or ids (LS-8669 review).
 *
 * Icons are platform-specific (JSX on web, react-native-svg on native), so
 * each template carries an `iconKind` discriminator rather than a rendered
 * icon — each platform maps it to its own icon component.
 */

export type MinigameId = 'season-draft' | 'disclosure' | 'twenty-questions';

export type MinigameIconKind = 'draft' | 'stats';

export interface MinigameStat {
  label: string;
  value: string;
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
    iconKind: 'stats',
    meta: ['Up to 20 questions', 'Easy · Medium · Hard'],
    cta: 'Play Now',
  },
];

/** Shared stat-selection logic — identical business rules on both platforms. */
export function statFor(
  id: MinigameId,
  args: { activeGamesCount: number | null; bestScore: number | null },
): MinigameStat {
  switch (id) {
    case 'season-draft':
      return {
        label: 'Games Active',
        value:
          args.activeGamesCount !== null ? String(args.activeGamesCount) : '—',
      };
    case 'disclosure':
      return {
        label: 'Your Best',
        value: args.bestScore !== null ? String(args.bestScore) : '—',
      };
    case 'twenty-questions':
      return { label: 'Questions', value: '20' };
  }
}
