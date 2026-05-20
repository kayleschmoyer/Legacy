import type { Headline, HeadlineVariant } from './types';

export const HEADLINES: Record<HeadlineVariant, Headline> = {
  dynasty: {
    eyebrow: 'Members Clubhouse',
    h1a: 'Take the field.',
    h1b: 'Claim your dynasty.',
    lede: 'Sign in to manage your rosters, draft legends across every era, and see how your lineup stacked up this week.',
  },
  dugout: {
    eyebrow: 'Clubhouse Entry',
    h1a: 'Welcome back,',
    h1b: 'Commissioner.',
    lede: 'Your league is waiting. Sign in to check the scoreboard, approve trades, and set your lineup before first pitch.',
  },
  history: {
    eyebrow: 'One Login · Every Era',
    h1a: 'Every legend.',
    h1b: 'One lineup.',
    lede: 'From 1876 to this afternoon — sign in to draft across a century and a half of archived baseball statistics.',
  },
};
