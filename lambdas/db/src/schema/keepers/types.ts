/**
 * Keeper designations domain — GraphQL type definitions (LS-8673)
 */
import { builder } from '../builder';

export const KeeperDesignation = builder.objectRef<{
  id: number;
  leagueId: number;
  teamId: number;
  playerId: number;
  season: number;
  costRound: number | null;
  costAmount: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}>('KeeperDesignation');

KeeperDesignation.implement({
  description:
    "A manager's pre-draft designation of a roster player to keep into the " +
    'next season. Locks once the league draft goes live. (LS-8673)',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    teamId: t.exposeInt('teamId'),
    playerId: t.exposeInt('playerId'),
    season: t.exposeInt('season'),
    costRound: t.exposeInt('costRound', { nullable: true }),
    costAmount: t.exposeInt('costAmount', { nullable: true }),
    status: t.exposeString('status'),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (parent) => parent.updatedAt.toISOString(),
    }),
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (parent, _args, context) =>
        context.loaders.players.load(parent.playerId),
    }),
  }),
});

export const KeeperEligiblePlayer = builder.objectRef<{
  playerId: number;
  teamId: number;
  isRookie: boolean;
  designated: boolean;
  designationId: number | null;
  previewCostRound: number | null;
  previewCostAmount: number | null;
}>('KeeperEligiblePlayer');

KeeperEligiblePlayer.implement({
  description:
    'A roster player eligible for keeper designation, with rookie-exemption ' +
    'and estimated-cost preview info for the manager designation UI. (LS-8673)',
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    teamId: t.exposeInt('teamId'),
    isRookie: t.exposeBoolean('isRookie', {
      description:
        'True when the player has zero recorded career MLB games — the ' +
        'signal used for keeperSettings.rookieExempt (there is no dedicated ' +
        'rookie-season field on the historical player dataset).',
    }),
    designated: t.exposeBoolean('designated', {
      description:
        'True when this player currently has a pending or locked keeper designation.',
    }),
    designationId: t.exposeInt('designationId', { nullable: true }),
    previewCostRound: t.exposeInt('previewCostRound', {
      nullable: true,
      description:
        "Estimated forfeited round for 'round-penalty' leagues. Null for " +
        "'auction-budget' leagues or when not applicable. Final cost is " +
        'resolved at draft initialization.',
    }),
    previewCostAmount: t.exposeInt('previewCostAmount', {
      nullable: true,
      description:
        "Estimated auction budget deduction for 'auction-budget' leagues. " +
        'Currently always null — the deduction source is an open product ' +
        'question (last winning bid vs. commissioner-set); no value is ' +
        'fabricated here. Final cost is resolved at draft initialization.',
    }),
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (parent, _args, context) =>
        context.loaders.players.load(parent.playerId),
    }),
  }),
});
