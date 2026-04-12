/**
 * Shared help page content — single source of truth for FAQ items, getting-started
 * steps, and contact options used by both the web and mobile help screens.
 */

/* ─── Types ─── */

export interface HelpFaqItem {
  question: string;
  answer: string;
}

export interface HelpGettingStartedStep {
  step: number;
  title: string;
  body: string;
}

export interface HelpContactItem {
  icon: string;
  title: string;
  description: string;
  url?: string;
  /** When set, the item triggers an in-app action (with `url` as fallback). */
  action?: 'bug-report';
}

/* ─── General FAQ ─── */

export const HELP_FAQ_ITEMS: HelpFaqItem[] = [
  {
    question: 'How do I create a fantasy baseball league?',
    answer:
      'Navigate to Baseball → Create League from the top navigation. Fill in your league name, choose your scoring settings, and set the number of teams. Once created, you can invite others using the league invite code found in the League Settings tab.',
  },
  {
    question: 'How do I invite teammates to join my league?',
    answer:
      'Open your league page and go to the Settings tab. Copy the invite code or share the invite link directly. Players can join via Baseball → Join League and entering the code, or by clicking your shared link.',
  },
  {
    question: 'How does the draft work?',
    answer:
      'When the league commissioner starts the draft, all team managers join the Draft Board. Players are listed in order of their projected value. Each team picks in snake-draft order by default (the order reverses each round), though commissioners can also choose linear order. The draft board live-updates so you can see picks in real time.',
  },
  {
    question: 'How is my team score calculated?',
    answer:
      "Scores are calculated from archived MLB box-score statistics loaded when games are selected for your matchup. Each counting stat (H, HR, RBI, R, SB, etc.) is multiplied by a configurable point value defined in your league's scoring profile. You can view the exact scoring breakdown in your league's Settings tab.",
  },
  {
    question: 'How do I add or drop players?',
    answer:
      'Go to your team page and click Manage Roster. You can drop a current player and pick up a free agent in one transaction. Waiver rules (if enabled) queue your claim for nightly processing at 2 AM EST, so your pickup may be delayed up to 24 hours.',
  },
  {
    question: 'How do I view matchup results?',
    answer:
      'Click on your league and select the Matchups tab. Current and historical matchup scores are shown there. You can also click into any matchup for a player-by-player breakdown.',
  },
  {
    question: 'Why are my player statistics not updating?',
    answer:
      'Player statistics come from archived historical box scores and are loaded when games are selected for your matchup. If stats appear missing after a game has been selected, the system may still be loading data from our historical data source. This usually completes within minutes. If stats are still missing after an hour, try refreshing the page or contact support.',
  },
  {
    question: 'How do I change my display name or avatar?',
    answer:
      'Go to Profile → Settings from the user menu. You can update your display name and other profile details there.',
  },
];

/* ─── Historical stats FAQ ─── */

export const HELP_HISTORICAL_FAQ_ITEMS: HelpFaqItem[] = [
  {
    question: 'What makes Legacy Sports different from live fantasy leagues?',
    answer:
      'Legacy Sports uses archived MLB box scores from historical seasons rather than live games. Each player is assigned a season from their own career, so your roster can span multiple eras. Every stat is final, verified, and drawn from real history — no weather cancellations, no injury luck mid-game. Pure historical knowledge is your edge.',
  },
  {
    question: 'What is a "season assignment"?',
    answer:
      'When you draft a player, the system automatically assigns them a season from their MLB career — a year when they played enough games to fill a full matchup schedule. Each player on your roster can come from a different era, so your 1927 Babe Ruth plays alongside a 2019 Mike Trout. Your knowledge of great historical seasons across all eras is your competitive edge.',
  },
  {
    question: 'How does game selection work?',
    answer:
      "Each matchup consists of a set number of randomly selected historical games per player (default 5). The system automatically selects one game per day for all active matchups. Games are drawn randomly from each player's assigned season, excluding previously selected games, so no game is repeated within a matchup. Commissioners can configure how many games occur per matchup in league settings.",
  },
  {
    question: 'What is an archived box score?',
    answer:
      "An archived box score is the official record of a completed MLB game: every at-bat, hit, run, RBI, pitching line, and fielding stat. Legacy Sports reads these records to calculate your fantasy team's score with 100% accuracy against real historical data.",
  },
  {
    question: 'Can I use the same player in multiple leagues?',
    answer:
      'Yes! Each league has its own draft, and seasons are assigned per player. You can own the same player in different leagues — their stats may come from different historical seasons, so your scores will differ between leagues.',
  },
  {
    question: "Why did my player's stats change after the week ended?",
    answer:
      'Our system processes archived games in batches. Scores may take a short time to fully settle after the matchup period ends. Once all selected games are processed, scores are final and will not change.',
  },
];

/* ─── Getting started steps ─── */

export const HELP_GETTING_STARTED_STEPS: HelpGettingStartedStep[] = [
  {
    step: 1,
    title: 'Create or join a league',
    body: 'Head to the Baseball section and either create a new private league or join an existing one with an invite code.',
  },
  {
    step: 2,
    title: 'Set your roster',
    body: 'Once the league draft is complete, review your roster and make any trades or waiver wire moves to build the best team.',
  },
  {
    step: 3,
    title: 'Follow the season',
    body: 'Check your matchup score throughout the week. Real MLB stats power your fantasy team — every hit, homer, and strikeout counts.',
  },
  {
    step: 4,
    title: 'Win the championship',
    body: 'Manage your roster actively through the season, make smart trades, and outlast your league-mates in the playoffs.',
  },
];

/* ─── Contact / support options ─── */

/** Canonical Discord invite URL — single source of truth for all help UI. */
export const DISCORD_URL = 'https://discord.gg/legacy-sports';

export const HELP_CONTACT_ITEMS: HelpContactItem[] = [
  {
    icon: '🐛',
    title: 'Report a Bug',
    description:
      "Found something broken? Let us know and we'll prioritize a fix.",
    url: 'https://github.com/bkrupa/legacy-sports/issues/new?labels=bug&template=bug_report.md',
    action: 'bug-report',
  },
  {
    icon: '💡',
    title: 'Suggest a Feature',
    description:
      "Have an idea that would make Legacy Sports better? We'd love to hear it.",
    url: 'https://github.com/bkrupa/legacy-sports/issues/new?labels=enhancement&template=feature_request.md',
  },
  {
    icon: '💬',
    title: 'Community Discussions',
    description:
      'Chat with other managers, share tips, and get advice from the community.',
    url: 'https://github.com/bkrupa/legacy-sports/discussions',
  },
  {
    icon: '🎮',
    title: 'Join our Discord',
    description:
      'Get real-time help, chat with the community, and reach the team faster.',
    url: DISCORD_URL,
  },
];
