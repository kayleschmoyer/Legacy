/**
 * Draft slot trades domain — GraphQL type definitions
 *
 * DraftSlotTrade: a pre-draft proposal to swap two teams' draft pick slots.
 */
import { builder } from '../builder';

export const DraftSlotTrade = builder.objectRef<{
  id: number;
  leagueId: number;
  proposerTeamId: number;
  counterpartTeamId: number;
  status:
    | 'proposed'
    | 'accepted'
    | 'declined'
    | 'approved'
    | 'executed'
    | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  proposerTeamName?: string | null;
  counterpartTeamName?: string | null;
}>('DraftSlotTrade');

DraftSlotTrade.implement({
  description:
    'A proposal to swap two teams’ draft pick slots before the draft starts',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    proposerTeamId: t.exposeInt('proposerTeamId'),
    counterpartTeamId: t.exposeInt('counterpartTeamId'),
    status: t.exposeString('status'),
    proposerTeamName: t.string({
      nullable: true,
      resolve: (parent) => parent.proposerTeamName ?? null,
    }),
    counterpartTeamName: t.string({
      nullable: true,
      resolve: (parent) => parent.counterpartTeamName ?? null,
    }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (parent) => parent.updatedAt.toISOString(),
    }),
  }),
});
