/**
 * Draft queue mutations (LS-473)
 *
 * Allows users to set a ranked list of players for auto-pick to select
 * on their behalf. The auto-pick engine checks this queue first (priority ASC),
 * picking the first available, eligible, undrafted player, then falls back
 * to the FPG × positional-scarcity algorithm.
 *
 * Mutations:
 *   setDraftQueue     — replace the entire queue atomically
 *   addToDraftQueue   — append a single player to the queue
 *   removeFromDraftQueue — remove a single player from the queue and compact priorities
 *   reorderDraftQueue — replace priority ordering (same player set, new order)
 */

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, eq } from 'drizzle-orm';

import { DraftQueueEntry } from '../types';
import { builder } from '../../builder';
import { AuthenticationError } from '../../graphql-errors';

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolveTeamIdForDraft(
  db: PublicDb,
  draftId: number,
  userId: number,
): Promise<{ teamId: number; leagueId: number }> {
  const [draft] = await db
    .select({ leagueId: PublicSchema.drafts.leagueId })
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.id, draftId))
    .limit(1);
  if (!draft) throw new Error('Draft not found');

  const [membership] = await db
    .select({ teamId: PublicSchema.leagueMembers.teamId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership?.teamId)
    throw new Error('You are not a member of this league');

  return { teamId: membership.teamId, leagueId: draft.leagueId };
}

// ── setDraftQueue ─────────────────────────────────────────────────────────────

/**
 * Mutation: setDraftQueue (LS-473)
 *
 * Atomically replaces the caller's draft queue for the given draft.
 * playerIds order defines priority: first element = priority 1 (picked first).
 * Pass an empty array to clear the queue.
 */
builder.mutationField('setDraftQueue', (t) =>
  t.field({
    type: [DraftQueueEntry],
    args: {
      draftId: t.arg.int({ required: true }),
      playerIds: t.arg.intList({ required: true }),
    },
    description:
      "Replace the current user's draft queue for a draft. The order of playerIds defines pick priority (index 0 = first pick). Pass an empty array to clear.",
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { draftId, playerIds } = args;
      const userId = context.user.id;

      const { teamId } = await resolveTeamIdForDraft(
        context.db,
        draftId,
        userId,
      );

      // Validate max queue size
      if (playerIds.length > 200) {
        throw new Error('Draft queue cannot exceed 200 players');
      }

      // Deduplicate while preserving order
      const seen = new Set<number>();
      const deduped: number[] = [];
      for (const pid of playerIds) {
        if (!seen.has(pid)) {
          seen.add(pid);
          deduped.push(pid);
        }
      }

      const rows = await context.db.transaction(async (tx) => {
        // Delete existing queue entries for this team in this draft
        await tx
          .delete(PublicSchema.draftQueue)
          .where(
            and(
              eq(PublicSchema.draftQueue.draftId, draftId),
              eq(PublicSchema.draftQueue.teamId, teamId),
            ),
          );

        if (deduped.length === 0) return [];

        // Insert new entries with 1-based priority
        const insertValues = deduped.map((playerId, idx) => ({
          draftId,
          teamId,
          playerId,
          priority: idx + 1,
        }));

        const inserted = await tx
          .insert(PublicSchema.draftQueue)
          .values(insertValues)
          .returning();

        return inserted.sort((a, b) => a.priority - b.priority);
      });

      LOGGER.info('[LS-473] Draft queue set', {
        draftId,
        teamId,
        count: rows.length,
      });

      return rows;
    },
  }),
);

// ── addToDraftQueue ───────────────────────────────────────────────────────────

/**
 * Mutation: addToDraftQueue (LS-473)
 *
 * Appends a single player to the end of the caller's draft queue.
 * If the player is already in the queue, returns the existing queue unchanged.
 */
builder.mutationField('addToDraftQueue', (t) =>
  t.field({
    type: [DraftQueueEntry],
    args: {
      draftId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    description:
      "Add a player to the end of the current user's draft queue. No-ops if already queued.",
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { draftId, playerId } = args;
      const userId = context.user.id;

      const { teamId } = await resolveTeamIdForDraft(
        context.db,
        draftId,
        userId,
      );

      const rows = await context.db.transaction(async (tx) => {
        // Check if already queued
        const [existing] = await tx
          .select({ id: PublicSchema.draftQueue.id })
          .from(PublicSchema.draftQueue)
          .where(
            and(
              eq(PublicSchema.draftQueue.draftId, draftId),
              eq(PublicSchema.draftQueue.teamId, teamId),
              eq(PublicSchema.draftQueue.playerId, playerId),
            ),
          )
          .limit(1);

        if (!existing) {
          // Determine next priority
          const currentEntries = await tx
            .select({ priority: PublicSchema.draftQueue.priority })
            .from(PublicSchema.draftQueue)
            .where(
              and(
                eq(PublicSchema.draftQueue.draftId, draftId),
                eq(PublicSchema.draftQueue.teamId, teamId),
              ),
            );

          if (currentEntries.length >= 200) {
            throw new Error('Draft queue cannot exceed 200 players');
          }

          const maxPriority = currentEntries.reduce(
            (max, e) => Math.max(max, e.priority),
            0,
          );

          await tx.insert(PublicSchema.draftQueue).values({
            draftId,
            teamId,
            playerId,
            priority: maxPriority + 1,
          });
        }

        return tx
          .select()
          .from(PublicSchema.draftQueue)
          .where(
            and(
              eq(PublicSchema.draftQueue.draftId, draftId),
              eq(PublicSchema.draftQueue.teamId, teamId),
            ),
          )
          .orderBy(asc(PublicSchema.draftQueue.priority));
      });

      LOGGER.info('[LS-473] Player added to draft queue', {
        draftId,
        teamId,
        playerId,
      });

      return rows;
    },
  }),
);

// ── removeFromDraftQueue ──────────────────────────────────────────────────────

/**
 * Mutation: removeFromDraftQueue (LS-473)
 *
 * Removes a player from the caller's queue and compacts priorities so there
 * are no gaps (1, 2, 3, … without holes). Returns the updated queue.
 */
builder.mutationField('removeFromDraftQueue', (t) =>
  t.field({
    type: [DraftQueueEntry],
    args: {
      draftId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    description: "Remove a player from the current user's draft queue.",
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { draftId, playerId } = args;
      const userId = context.user.id;

      const { teamId } = await resolveTeamIdForDraft(
        context.db,
        draftId,
        userId,
      );

      const rows = await context.db.transaction(async (tx) => {
        // Remove the entry
        await tx
          .delete(PublicSchema.draftQueue)
          .where(
            and(
              eq(PublicSchema.draftQueue.draftId, draftId),
              eq(PublicSchema.draftQueue.teamId, teamId),
              eq(PublicSchema.draftQueue.playerId, playerId),
            ),
          );

        // Re-fetch remaining entries
        const remaining = await tx
          .select()
          .from(PublicSchema.draftQueue)
          .where(
            and(
              eq(PublicSchema.draftQueue.draftId, draftId),
              eq(PublicSchema.draftQueue.teamId, teamId),
            ),
          )
          .orderBy(asc(PublicSchema.draftQueue.priority));

        // Compact priorities (fill any gap left by the deleted entry)
        for (let i = 0; i < remaining.length; i++) {
          const entry = remaining[i];
          if (entry && entry.priority !== i + 1) {
            await tx
              .update(PublicSchema.draftQueue)
              .set({ priority: i + 1 })
              .where(eq(PublicSchema.draftQueue.id, entry.id));
            entry.priority = i + 1;
          }
        }

        return remaining;
      });

      LOGGER.info('[LS-473] Player removed from draft queue', {
        draftId,
        teamId,
        playerId,
      });

      return rows;
    },
  }),
);

// ── reorderDraftQueue ─────────────────────────────────────────────────────────

/**
 * Mutation: reorderDraftQueue (LS-473)
 *
 * Re-sets priorities for the existing queue entries. playerIds must contain
 * exactly the same player IDs that are currently in the queue (no additions
 * or removals). Returns the reordered queue.
 */
builder.mutationField('reorderDraftQueue', (t) =>
  t.field({
    type: [DraftQueueEntry],
    args: {
      draftId: t.arg.int({ required: true }),
      playerIds: t.arg.intList({ required: true }),
    },
    description:
      "Reorder the current user's draft queue. playerIds must contain the same players that are already queued — only the order changes.",
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { draftId, playerIds } = args;
      const userId = context.user.id;

      const { teamId } = await resolveTeamIdForDraft(
        context.db,
        draftId,
        userId,
      );

      const rows = await context.db.transaction(async (tx) => {
        // Fetch current queue
        const current = await tx
          .select()
          .from(PublicSchema.draftQueue)
          .where(
            and(
              eq(PublicSchema.draftQueue.draftId, draftId),
              eq(PublicSchema.draftQueue.teamId, teamId),
            ),
          );

        const currentPlayerIds = new Set(current.map((e) => e.playerId));
        const newPlayerIds = new Set(playerIds);

        // Validate same set
        const sameSize = currentPlayerIds.size === newPlayerIds.size;
        const allPresent =
          sameSize && [...newPlayerIds].every((id) => currentPlayerIds.has(id));
        if (!allPresent) {
          throw new Error(
            'reorderDraftQueue: playerIds must match the current queue exactly (no additions or removals)',
          );
        }

        // Build id map: playerId → row id
        const idMap = new Map(current.map((e) => [e.playerId, e.id]));

        // Update priorities in order
        // Use large temp priorities first to avoid unique-constraint conflicts
        const tempBase = 10000;
        await Promise.all(
          playerIds.map((pid, idx) => {
            const rowId = idMap.get(pid);
            if (!rowId) throw new Error(`Player ${pid} not found in queue`);
            return tx
              .update(PublicSchema.draftQueue)
              .set({ priority: tempBase + idx + 1 })
              .where(eq(PublicSchema.draftQueue.id, rowId));
          }),
        );

        // Set final priorities
        await Promise.all(
          playerIds.map((pid, idx) => {
            const rowId = idMap.get(pid);
            if (!rowId) throw new Error(`Player ${pid} not found in queue`);
            return tx
              .update(PublicSchema.draftQueue)
              .set({ priority: idx + 1 })
              .where(eq(PublicSchema.draftQueue.id, rowId));
          }),
        );

        return tx
          .select()
          .from(PublicSchema.draftQueue)
          .where(
            and(
              eq(PublicSchema.draftQueue.draftId, draftId),
              eq(PublicSchema.draftQueue.teamId, teamId),
            ),
          )
          .orderBy(asc(PublicSchema.draftQueue.priority));
      });

      LOGGER.info('[LS-473] Draft queue reordered', {
        draftId,
        teamId,
        count: rows.length,
      });

      return rows;
    },
  }),
);
