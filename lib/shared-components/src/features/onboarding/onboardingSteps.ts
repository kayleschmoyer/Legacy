/**
 * Platform-neutral onboarding tutorial content (LS-10379).
 *
 * Pure data: copy and labels identical to the web tutorial, with no JSX, DOM
 * or router references. Renderers (web, native) map the blocks to their own
 * primitives. Web-only illustrations are `slot` blocks the renderer may fill
 * (or skip); links are plain paths the renderer wires to its own navigation.
 */

export type OnboardingAccent = 'navyLight' | 'seamRed' | 'goldDark';

/** Inline text run inside a paragraph. */
export type OnboardingInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'tooltip'; term: string; explanation: string };

export type OnboardingSlotId = 'game-slots-example' | 'sample-matchup-card';

export interface OnboardingChecklistItem {
  step: string;
  title: string;
  desc: string;
  link: string | null;
  linkText: string | null;
}

export type OnboardingBlock =
  | { type: 'paragraph'; size: 'lg' | 'md'; inlines: OnboardingInline[] }
  | {
      type: 'callout';
      icon: string;
      iconLabel: string;
      title: string;
      body: string;
    }
  | { type: 'bullets'; items: { icon: string; text: string }[] }
  | {
      type: 'scoring-table';
      title: string;
      rows: { stat: string; pts: string }[];
    }
  | { type: 'checklist'; items: OnboardingChecklistItem[] }
  | { type: 'slot'; slot: OnboardingSlotId };

export interface OnboardingStep {
  id: string;
  emoji: string;
  emojiLabel: string;
  title: string;
  accent: OnboardingAccent;
  blocks: OnboardingBlock[];
}

const text = (t: string): OnboardingInline => ({ type: 'text', text: t });
const strong = (t: string): OnboardingInline => ({ type: 'strong', text: t });
const tooltip = (term: string, explanation: string): OnboardingInline => ({
  type: 'tooltip',
  term,
  explanation,
});
const para = (
  size: 'lg' | 'md',
  ...inlines: OnboardingInline[]
): OnboardingBlock => ({ type: 'paragraph', size, inlines });

/** Sample data for the example illustrations (rendered by `slot` fillers). */
export const ONBOARDING_SAMPLE_SEASON = 2019;
export const ONBOARDING_SAMPLE_GAME_SLOTS = [
  {
    slot: 'Game 1',
    matchup: 'PHI @ NYM',
    date: `Aug 5, ${ONBOARDING_SAMPLE_SEASON}`,
  },
  {
    slot: 'Game 2',
    matchup: 'CHC @ STL',
    date: `Aug 7, ${ONBOARDING_SAMPLE_SEASON}`,
  },
  {
    slot: 'Game 3',
    matchup: 'BOS @ NYY',
    date: `Aug 9, ${ONBOARDING_SAMPLE_SEASON}`,
  },
  {
    slot: 'Game 4',
    matchup: 'LAD @ SF',
    date: `Aug 12, ${ONBOARDING_SAMPLE_SEASON}`,
  },
  {
    slot: 'Game 5',
    matchup: 'HOU @ OAK',
    date: `Aug 14, ${ONBOARDING_SAMPLE_SEASON}`,
  },
];
export const ONBOARDING_SAMPLE_WEEK_LABEL = `Week 7 · Aug 5–14, ${ONBOARDING_SAMPLE_SEASON}`;
export const ONBOARDING_SAMPLE_TOP_PERFORMERS = [
  { name: 'Mike Trout', stats: '2 HR, 1 SB, 5 R', pts: '+18' },
  { name: 'Gerrit Cole', stats: 'W, 8 K, 1 ER', pts: '+14' },
];

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    emoji: '⚾',
    emojiLabel: 'baseball',
    title: 'Welcome to Legacy Sports',
    accent: 'navyLight',
    blocks: [
      para(
        'lg',
        text('Legacy Sports is a '),
        strong('historical fantasy baseball'),
        text(' platform — the only fantasy league powered entirely by '),
        tooltip(
          'archived box scores',
          "Real MLB box score data from past seasons, used as the statistical source for your fantasy team's weekly scores.",
        ),
        text(' from real MLB seasons.'),
      ),
      para(
        'lg',
        text(
          'Unlike live fantasy leagues, every matchup is scored from completed, verified statistics — no luck of the daily schedule, just pure historical knowledge.',
        ),
      ),
      {
        type: 'callout',
        icon: '💡',
        iconLabel: 'light bulb',
        title: 'Why does this matter?',
        body: "Build rosters that span generations—imagine Babe Ruth batting alongside Ken Griffey Jr. The fun is mixing legends from different eras and seeing how history's greatest players stack up.",
      },
    ],
  },
  {
    id: 'season-assignment',
    emoji: '📅',
    emojiLabel: 'calendar',
    title: 'Season Assignment',
    accent: 'seamRed',
    blocks: [
      para(
        'lg',
        text(
          'When you draft a player, the system automatically assigns them a ',
        ),
        tooltip(
          'season assignment',
          "The specific MLB calendar year automatically chosen for a player when they are drafted. The system picks a year from that player's career where they played enough games to fill a full matchup schedule.",
        ),
        text(
          " — an MLB year from that player's career whose stats will power their contribution to every matchup.",
        ),
      ),
      para(
        'lg',
        text('Each player on your roster can come from a '),
        strong('different era'),
        text(
          ' — your 1927 Babe Ruth plays alongside a 2019 Mike Trout. Your knowledge of great historical seasons across all eras is your edge.',
        ),
      ),
      {
        type: 'bullets',
        items: [
          {
            icon: '🎲',
            text: 'Each player is automatically assigned an eligible season from their MLB career when drafted.',
          },
          {
            icon: '🔒',
            text: 'Stats are final — no live games affect your score.',
          },
          {
            icon: '🏟️',
            text: 'Rosters can span multiple eras — any combination of MLB history is possible.',
          },
        ],
      },
    ],
  },
  {
    id: 'game-selection',
    emoji: '🎯',
    emojiLabel: 'target',
    title: 'Game Selection',
    accent: 'navyLight',
    blocks: [
      para(
        'lg',
        tooltip(
          'Game selection',
          'The automatic process of picking which games from the assigned MLB season are used to score each weekly matchup. Each matchup has a configured number of game slots, and one random game is chosen per slot.',
        ),
        text(
          ' determines which games from the assigned season count toward each weekly matchup.',
        ),
      ),
      para(
        'lg',
        text(
          "Each matchup has a set number of game slots. One random game from the assigned season is picked for each slot — one game per matchup day. Your players' stats from those individual games accumulate into your matchup score.",
        ),
      ),
      { type: 'slot', slot: 'game-slots-example' },
    ],
  },
  {
    id: 'scoring',
    emoji: '📊',
    emojiLabel: 'statistics',
    title: 'Scoring from Archived Box Scores',
    accent: 'goldDark',
    blocks: [
      para(
        'lg',
        text('Every fantasy point comes directly from a real MLB '),
        tooltip(
          'archived box score',
          "An official record of a completed MLB game, listing every player's at-bats, hits, runs, RBIs, pitching lines, and more. Legacy Sports reads these to calculate your fantasy score.",
        ),
        text(
          ' — the official statistical record of every game in the assigned season.',
        ),
      ),
      {
        type: 'scoring-table',
        title: 'Default Scoring Values',
        rows: [
          { stat: 'Home Run (HR)', pts: '+4' },
          { stat: 'RBI', pts: '+1' },
          { stat: 'Run Scored (R)', pts: '+1' },
          { stat: 'Hit (H)', pts: '+1' },
          { stat: 'Stolen Base (SB)', pts: '+2' },
          { stat: 'Strikeout (Batter)', pts: '−1' },
          { stat: 'Win (Pitcher)', pts: '+7' },
          { stat: 'Earned Run Allowed (ER)', pts: '−1 per run' },
        ],
      },
      para(
        'md',
        text(
          'League commissioners can customize scoring weights in league settings.',
        ),
      ),
    ],
  },
  {
    id: 'sample-matchup',
    emoji: '🏆',
    emojiLabel: 'trophy',
    title: 'Sample Matchup',
    accent: 'navyLight',
    blocks: [
      para(
        'lg',
        text("Here's what a typical week looks like in your league dashboard:"),
      ),
      { type: 'slot', slot: 'sample-matchup-card' },
      para(
        'md',
        text(
          'Live matchup scores update as our system processes each archived game from the assigned season.',
        ),
      ),
    ],
  },
  {
    id: 'get-started',
    emoji: '🚀',
    emojiLabel: 'rocket',
    title: "You're Ready to Play!",
    accent: 'goldDark',
    blocks: [
      para(
        'lg',
        text(
          "You now know everything you need to dominate your Legacy Sports league. Here's your quick-start checklist:",
        ),
      ),
      {
        type: 'callout',
        icon: '🎟️',
        iconLabel: 'ticket',
        title: "What's included free",
        body: 'Free accounts can be in up to 3 leagues total (baseball and football combined), get 2 mock drafts per week, and can’t use Premium-only league formats such as Keeper mode. Premium lifts these limits.',
      },
      {
        type: 'checklist',
        items: [
          {
            step: '1',
            title: 'Create or join a league',
            desc: 'Head to Baseball and set up a league with friends. Player season assignments are handled automatically — just draft and compete.',
            link: '/baseball/league/create',
            linkText: 'Create League →',
          },
          {
            step: '2',
            title: 'Draft your roster',
            desc: 'Pick any MLB player from history. Each player is automatically assigned an eligible season from their career — deep knowledge across all eras wins here.',
            link: null,
            linkText: null,
          },
          {
            step: '3',
            title: 'Follow your matchups',
            desc: 'Check weekly scores as archived game stats accumulate into your matchup total.',
            link: '/baseball',
            linkText: 'View Leagues →',
          },
          {
            step: '4',
            title: 'Need more room?',
            desc: 'Premium unlocks unlimited leagues, unlimited mock drafts, and every league format.',
            link: '/pricing',
            linkText: 'See Plans →',
          },
        ],
      },
      para(
        'md',
        text('You can always review this tutorial by clicking '),
        strong('Help → Launch Tutorial'),
        text(' at any time.'),
      ),
    ],
  },
];
