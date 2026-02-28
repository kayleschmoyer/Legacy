/**
 * Narrative sentence templates, organized by scenario.
 *
 * All strings use {placeholder} tokens replaced at runtime.
 */

// ── Opening Lines ─────────────────────────────────────────────────────────────

export const BLOWOUT_OPENINGS = [
  '{winner} made a statement in Week {week}, steamrolling {loser} {winScore}–{lossScore} in a commanding performance.',
  'It was no contest in Week {week}. {winner} dismantled {loser} by a score of {winScore}–{lossScore}.',
  '{winner} left no doubt in Week {week}, delivering a {winScore}–{lossScore} blowout over {loser}.',
];

export const CLOSE_OPENINGS = [
  'It went down to the wire in Week {week}. {winner} edged out {loser} {winScore}–{lossScore} in a nail-biter.',
  'Week {week} provided the drama fans live for — {winner} squeaked past {loser} {winScore}–{lossScore}.',
  'In one of the closest matchups of the season, {winner} outlasted {loser} {winScore}–{lossScore} in Week {week}.',
];

export const NORMAL_OPENINGS = [
  '{winner} took care of business in Week {week}, defeating {loser} {winScore}–{lossScore}.',
  'A solid Week {week} performance saw {winner} top {loser} {winScore}–{lossScore}.',
  'Week {week} belonged to {winner}, who handled {loser} {winScore}–{lossScore}.',
];

// ── Standout Performer Lines ──────────────────────────────────────────────────

export const BATTER_STANDOUT_LINES = [
  '{playerName} ({season}) carried {teamName} with an explosive offensive showing.',
  'The historical {season} season of {playerName} came alive for {teamName} this week.',
  "{teamName} leaned on {playerName}'s legendary {season} bat, and it delivered.",
];

export const PITCHER_STANDOUT_LINES = [
  "{playerName} ({season}) anchored {teamName}'s pitching staff with a dominant outing.",
  "On the mound, {teamName}'s {playerName} from the {season} season proved unhittable.",
  "{playerName}'s ({season}) arm kept {teamName} in control throughout the week.",
];

// ── Closing Lines ─────────────────────────────────────────────────────────────

export const BLOWOUT_CLOSINGS = [
  "A dominant week that will be remembered in {winner}'s season.",
  'The margin of victory speaks for itself — {winner} is firing on all cylinders.',
];

export const CLOSE_CLOSINGS = [
  'A one-point swing either way could have changed everything.',
  'Moments like this are what make the historical format so compelling.',
  'Fantasy managers on both sides will be talking about this one for weeks.',
];

export const NORMAL_CLOSINGS = [
  '{winner} moves the right direction in the standings.',
  'Another week in the books for {winner}.',
];
