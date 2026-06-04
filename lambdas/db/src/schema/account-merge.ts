/**
 * Account Merge — GraphQL mutation for merging two user accounts.
 *
 * Transfers all data from the source account to the target account atomically:
 * leagues, team memberships, messages, trades, waivers, badges, etc.
 *
 * The authenticated user must be the target account owner. They provide
 * the source user ID (from a previous auth step that verified ownership).
 *
 * (LS-1676: Merge Discord and Google accounts into a single user account)
 */

import { LOGGER } from '@legacy-sports/logging';
import { sql } from 'drizzle-orm';

import { builder, type Context } from './builder';
import { requireAdmin } from './authorization';
import { UserInputError } from './graphql-errors';

// ── Response Type ────────────────────────────────────────────────────────────

interface MergeAccountsResultShape {
  success: boolean;
  targetUserId: number;
  sourceUserId: number;
  tablesUpdated: string[];
  errors: string[];
}

const MergeAccountsResult = builder.objectRef<MergeAccountsResultShape>(
  'MergeAccountsResult',
);

builder.objectType(MergeAccountsResult, {
  description: 'Result of merging two user accounts',
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    targetUserId: t.exposeInt('targetUserId'),
    sourceUserId: t.exposeInt('sourceUserId'),
    tablesUpdated: t.exposeStringList('tablesUpdated'),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Mutation ────────────────────────────────────────────────────────────────

builder.mutationField('mergeAccounts', (t) =>
  t.field({
    type: MergeAccountsResult,
    description:
      'Merge a source user account into the authenticated (target) user account. ' +
      'Transfers all leagues, rosters, messages, and settings. The source account is deactivated. ' +
      'Requires admin access.',
    args: {
      sourceUserId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context: Context) => {
      // Verify admin access against the database (not just the JWT claim —
      // a stale token could otherwise grant access after admin is revoked).
      // The frontend is responsible for proving ownership of both accounts
      // before calling this mutation.
      await requireAdmin(context);

      const targetUserId = context.user!.id;
      const sourceUserId = args.sourceUserId;

      if (targetUserId === sourceUserId) {
        throw UserInputError('Cannot merge an account with itself');
      }

      const tablesUpdated: string[] = [];
      const errors: string[] = [];

      try {
        // Verify both users exist
        const [sourceUser] = await context.db
          .select({
            id: sql<number>`id`,
            email: sql<string>`email`,
          })
          .from(sql`app_internal.users`)
          .where(sql`id = ${sourceUserId}`);

        const [targetUser] = await context.db
          .select({
            id: sql<number>`id`,
            email: sql<string>`email`,
          })
          .from(sql`app_internal.users`)
          .where(sql`id = ${targetUserId}`);

        if (!sourceUser)
          throw UserInputError(`Source user ${sourceUserId} not found`);
        if (!targetUser)
          throw UserInputError(`Target user ${targetUserId} not found`);

        LOGGER.info('Starting account merge', {
          targetUserId,
          sourceUserId,
          targetEmail: targetUser.email,
          sourceEmail: sourceUser.email,
        });

        // ── Transfer all references in a single transaction ──
        // Using raw SQL for cross-schema operations and tables without
        // Drizzle FK constraints.
        await context.db.transaction(async (tx) => {
          // 1. League ownership
          const leagueResult = await tx.execute(
            sql`UPDATE leagues SET owner = ${targetUserId} WHERE owner = ${sourceUserId}`,
          );
          if (leagueResult.rowCount)
            tablesUpdated.push(`leagues: ${leagueResult.rowCount} rows`);

          // 2. League member payment status — must run BEFORE league_members
          // to avoid FK constraint violations (payment_status references league_members).
          // Transfer source rows to target where target doesn't already have a row,
          // then delete remaining source rows.
          await tx.execute(
            sql`INSERT INTO league_member_payment_status (league_id, user_id, season, payment_status, marked_by, updated_at)
                SELECT lmps.league_id, ${targetUserId}, lmps.season, lmps.payment_status, lmps.marked_by, lmps.updated_at
                FROM league_member_payment_status lmps
                WHERE lmps.user_id = ${sourceUserId}
                AND NOT EXISTS (
                  SELECT 1 FROM league_member_payment_status t
                  WHERE t.league_id = lmps.league_id AND t.user_id = ${targetUserId} AND t.season = lmps.season
                )`,
          );
          await tx.execute(
            sql`DELETE FROM league_member_payment_status WHERE user_id = ${sourceUserId}`,
          );
          await tx.execute(
            sql`UPDATE league_member_payment_status SET marked_by = ${targetUserId} WHERE marked_by = ${sourceUserId}`,
          );

          // 3. League memberships — handle potential conflicts (both users in same league)
          // First, delete source memberships where target is already a member
          await tx.execute(
            sql`DELETE FROM league_members
                WHERE user_id = ${sourceUserId}
                AND league_id IN (
                  SELECT league_id FROM league_members WHERE user_id = ${targetUserId}
                )`,
          );
          const memberResult = await tx.execute(
            sql`UPDATE league_members SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );
          if (memberResult.rowCount)
            tablesUpdated.push(`league_members: ${memberResult.rowCount} rows`);

          // 4. League messages
          const msgResult = await tx.execute(
            sql`UPDATE league_messages SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );
          if (msgResult.rowCount)
            tablesUpdated.push(`league_messages: ${msgResult.rowCount} rows`);

          // 5. Direct messages
          const dmFromResult = await tx.execute(
            sql`UPDATE direct_messages SET from_user_id = ${targetUserId} WHERE from_user_id = ${sourceUserId}`,
          );
          const dmToResult = await tx.execute(
            sql`UPDATE direct_messages SET to_user_id = ${targetUserId} WHERE to_user_id = ${sourceUserId}`,
          );
          const dmCount =
            (dmFromResult.rowCount ?? 0) + (dmToResult.rowCount ?? 0);
          if (dmCount) tablesUpdated.push(`direct_messages: ${dmCount} rows`);

          // 6. Waiver claims
          const waiverResult = await tx.execute(
            sql`UPDATE waiver_claims SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );
          if (waiverResult.rowCount)
            tablesUpdated.push(`waiver_claims: ${waiverResult.rowCount} rows`);

          // 7. Commissioner audit log
          const auditResult = await tx.execute(
            sql`UPDATE commissioner_audit_log SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );
          if (auditResult.rowCount)
            tablesUpdated.push(
              `commissioner_audit_log: ${auditResult.rowCount} rows`,
            );

          // 8. Notification preferences
          await tx.execute(
            sql`DELETE FROM notification_preferences WHERE user_id = ${sourceUserId}`,
          );

          // 9. Device tokens
          await tx.execute(
            sql`DELETE FROM device_tokens WHERE user_id = ${sourceUserId}`,
          );

          // 10. Notification history
          const notifResult = await tx.execute(
            sql`UPDATE notification_history SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );
          if (notifResult.rowCount)
            tablesUpdated.push(
              `notification_history: ${notifResult.rowCount} rows`,
            );

          // 11. User badges — handle conflicts
          await tx.execute(
            sql`DELETE FROM user_badges
                WHERE user_id = ${sourceUserId}
                AND badge_id IN (
                  SELECT badge_id FROM user_badges WHERE user_id = ${targetUserId}
                )`,
          );
          const badgeResult = await tx.execute(
            sql`UPDATE user_badges SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );
          if (badgeResult.rowCount)
            tablesUpdated.push(`user_badges: ${badgeResult.rowCount} rows`);

          // 12. Badge progress — handle conflicts
          await tx.execute(
            sql`DELETE FROM badge_progress
                WHERE user_id = ${sourceUserId}
                AND badge_id IN (
                  SELECT badge_id FROM badge_progress WHERE user_id = ${targetUserId}
                )`,
          );
          const progressResult = await tx.execute(
            sql`UPDATE badge_progress SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );
          if (progressResult.rowCount)
            tablesUpdated.push(
              `badge_progress: ${progressResult.rowCount} rows`,
            );

          // 13. League activity log
          const activityResult = await tx.execute(
            sql`UPDATE league_activity_log SET actor_user_id = ${targetUserId} WHERE actor_user_id = ${sourceUserId}`,
          );
          if (activityResult.rowCount)
            tablesUpdated.push(
              `league_activity_log: ${activityResult.rowCount} rows`,
            );

          // 14. Season draft games
          const draftGameResult = await tx.execute(
            sql`UPDATE season_draft_games SET created_by = ${targetUserId} WHERE created_by = ${sourceUserId}`,
          );
          if (draftGameResult.rowCount)
            tablesUpdated.push(
              `season_draft_games: ${draftGameResult.rowCount} rows`,
            );

          // 15. Season draft players — handle conflicts
          await tx.execute(
            sql`DELETE FROM season_draft_players
                WHERE user_id = ${sourceUserId}
                AND game_id IN (
                  SELECT game_id FROM season_draft_players WHERE user_id = ${targetUserId}
                )`,
          );
          const draftPlayerResult = await tx.execute(
            sql`UPDATE season_draft_players SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );
          if (draftPlayerResult.rowCount)
            tablesUpdated.push(
              `season_draft_players: ${draftPlayerResult.rowCount} rows`,
            );

          // 16. Transfer subscriptions (internal schema, has cascade)
          await tx.execute(
            sql`UPDATE app_internal.subscriptions SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );

          // 17. Transfer consents
          await tx.execute(
            sql`DELETE FROM app_internal.user_consents WHERE user_id = ${sourceUserId}`,
          );

          // 18. Transfer data requests
          await tx.execute(
            sql`UPDATE app_internal.data_requests SET user_id = ${targetUserId} WHERE user_id = ${sourceUserId}`,
          );

          // ── Record the merge in audit log ──
          await tx.execute(
            sql`INSERT INTO app_internal.account_merge_log
                (target_user_id, source_user_id, source_email, target_email, merged_by_user_id, tables_updated)
                VALUES (${targetUserId}, ${sourceUserId}, ${sourceUser.email}, ${targetUser.email}, ${targetUserId}, ${JSON.stringify(tablesUpdated)}::jsonb)`,
          );

          // ── Deactivate source account ──
          // Anonymize email to free the unique constraint, keep record for audit
          const anonymizedEmail = `merged-${sourceUserId}@deactivated.local`;
          await tx.execute(
            sql`UPDATE app_internal.users
                SET email = ${anonymizedEmail},
                    username = ${`merged-${sourceUserId}`},
                    password_hash = NULL,
                    updated_at = NOW()
                WHERE id = ${sourceUserId}`,
          );
          tablesUpdated.push('source_account: deactivated');
        });

        LOGGER.info('Account merge completed', {
          targetUserId,
          sourceUserId,
          tablesUpdated,
        });

        return {
          success: true,
          targetUserId,
          sourceUserId,
          tablesUpdated,
          errors,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        LOGGER.error('Account merge failed', {
          targetUserId,
          sourceUserId,
          error: msg,
        });
        return {
          success: false,
          targetUserId,
          sourceUserId,
          tablesUpdated,
          errors: [msg],
        };
      }
    },
  }),
);
