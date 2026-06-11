import { LOGGER } from '@legacy-sports/logging';
import {
  type InternalDb,
  InternalSchema,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { eq, sql } from 'drizzle-orm';

export interface MergeAccountsArgs {
  primaryId: number;
  secondaryId: number;
  dryRun?: boolean;
  yes?: boolean;
}

interface UserSnapshot {
  id: number;
  canonicalEmail: string;
  username: string | null;
  createdAt: Date;
  passwordHash: string | null;
}

interface IdentitySnapshot {
  id: number;
  provider: string;
  providerAccountId: string | null;
  providerEmail: string | null;
  providerEmailVerified: boolean;
  linkedAt: Date;
}

interface SubscriptionSnapshot {
  id: number;
  status: string;
  tier: string;
  stripeCustomerId: string | null;
  appleOriginalTransactionId: string | null;
  googlePurchaseToken: string | null;
  currentPeriodEnd: Date | null;
}

interface MergePreview {
  primary: UserSnapshot;
  secondary: UserSnapshot;
  primaryIdentities: IdentitySnapshot[];
  secondaryIdentities: IdentitySnapshot[];
  primarySubscription: SubscriptionSnapshot | null;
  secondarySubscription: SubscriptionSnapshot | null;
  identityConflicts: string[];
  subscriptionConflicts: string[];
}

export async function fetchUserSnapshot(
  db: InternalDb,
  userId: number,
): Promise<UserSnapshot | null> {
  const rows = await db
    .select({
      id: InternalSchema.usersInAppInternal.id,
      canonicalEmail: InternalSchema.usersInAppInternal.canonicalEmail,
      username: InternalSchema.usersInAppInternal.username,
      createdAt: InternalSchema.usersInAppInternal.createdAt,
      passwordHash: InternalSchema.usersInAppInternal.passwordHash,
    })
    .from(InternalSchema.usersInAppInternal)
    .where(eq(InternalSchema.usersInAppInternal.id, userId));

  return rows[0] ?? null;
}

export async function fetchIdentitySnapshots(
  db: InternalDb,
  userId: number,
): Promise<IdentitySnapshot[]> {
  return db
    .select({
      id: InternalSchema.userIdentities.id,
      provider: InternalSchema.userIdentities.provider,
      providerAccountId: InternalSchema.userIdentities.providerAccountId,
      providerEmail: InternalSchema.userIdentities.providerEmail,
      providerEmailVerified:
        InternalSchema.userIdentities.providerEmailVerified,
      linkedAt: InternalSchema.userIdentities.linkedAt,
    })
    .from(InternalSchema.userIdentities)
    .where(eq(InternalSchema.userIdentities.userId, userId));
}

export async function fetchSubscriptionSnapshot(
  db: InternalDb,
  userId: number,
): Promise<SubscriptionSnapshot | null> {
  const rows = await db
    .select({
      id: InternalSchema.subscriptions.id,
      status: InternalSchema.subscriptions.status,
      tier: InternalSchema.subscriptions.tier,
      stripeCustomerId: InternalSchema.subscriptions.stripeCustomerId,
      appleOriginalTransactionId:
        InternalSchema.subscriptions.appleOriginalTransactionId,
      googlePurchaseToken: InternalSchema.subscriptions.googlePurchaseToken,
      currentPeriodEnd: InternalSchema.subscriptions.currentPeriodEnd,
    })
    .from(InternalSchema.subscriptions)
    .where(eq(InternalSchema.subscriptions.userId, userId))
    .limit(1);

  return rows[0] ?? null;
}

export function buildMergePreview(
  primary: UserSnapshot,
  secondary: UserSnapshot,
  primaryIdentities: IdentitySnapshot[],
  secondaryIdentities: IdentitySnapshot[],
  primarySubscription: SubscriptionSnapshot | null,
  secondarySubscription: SubscriptionSnapshot | null,
): MergePreview {
  const primaryProviders = new Set(primaryIdentities.map((i) => i.provider));

  const identityConflicts: string[] = [];
  for (const si of secondaryIdentities) {
    if (primaryProviders.has(si.provider)) {
      identityConflicts.push(
        `Both accounts have a '${si.provider}' identity — secondary's will be deleted`,
      );
    }
  }

  const subscriptionConflicts: string[] = [];
  if (primarySubscription && secondarySubscription) {
    const platforms: Array<[keyof SubscriptionSnapshot, string]> = [
      ['stripeCustomerId', 'Stripe'],
      ['appleOriginalTransactionId', 'Apple'],
      ['googlePurchaseToken', 'Google'],
    ];
    for (const [field, name] of platforms) {
      if (primarySubscription[field] && secondarySubscription[field]) {
        subscriptionConflicts.push(
          `Both accounts have a ${name} subscription — secondary's row will be transferred ` +
            `but the ${name} billing record requires manual review/cancellation`,
        );
      }
    }
  }

  return {
    primary,
    secondary,
    primaryIdentities,
    secondaryIdentities,
    primarySubscription,
    secondarySubscription,
    identityConflicts,
    subscriptionConflicts,
  };
}

function printMergePreview(preview: MergePreview): void {
  const fmt = (d: Date): string => d.toISOString().split('T')[0];

  LOGGER.info('\n📋 Account Merge Preview\n');
  LOGGER.info('PRIMARY (kept):');
  LOGGER.info(`  ID:         ${preview.primary.id}`);
  LOGGER.info(`  Email:      ${preview.primary.canonicalEmail}`);
  LOGGER.info(`  Username:   ${preview.primary.username ?? 'N/A'}`);
  LOGGER.info(`  Created:    ${fmt(preview.primary.createdAt)}`);
  LOGGER.info(
    `  Identities: ${
      preview.primaryIdentities.length
        ? preview.primaryIdentities.map((i) => i.provider).join(', ')
        : 'none'
    }`,
  );
  if (preview.primarySubscription) {
    const sub = preview.primarySubscription;
    const platforms = [
      sub.stripeCustomerId ? `Stripe(${sub.stripeCustomerId})` : '',
      sub.appleOriginalTransactionId ? `Apple` : '',
      sub.googlePurchaseToken ? `Google` : '',
    ]
      .filter(Boolean)
      .join(', ');
    LOGGER.info(
      `  Subscription: status=${sub.status} tier=${sub.tier}${platforms ? ` [${platforms}]` : ''}`,
    );
  } else {
    LOGGER.info('  Subscription: none');
  }

  LOGGER.info('\nSECONDARY (will be merged then deactivated):');
  LOGGER.info(`  ID:         ${preview.secondary.id}`);
  LOGGER.info(`  Email:      ${preview.secondary.canonicalEmail}`);
  LOGGER.info(`  Username:   ${preview.secondary.username ?? 'N/A'}`);
  LOGGER.info(`  Created:    ${fmt(preview.secondary.createdAt)}`);
  LOGGER.info(
    `  Identities: ${
      preview.secondaryIdentities.length
        ? preview.secondaryIdentities
            .map((i) => `${i.provider}(${i.providerEmail ?? 'no-email'})`)
            .join(', ')
        : 'none'
    }`,
  );
  if (preview.secondarySubscription) {
    const sub = preview.secondarySubscription;
    const platforms = [
      sub.stripeCustomerId ? `Stripe(${sub.stripeCustomerId})` : '',
      sub.appleOriginalTransactionId ? `Apple` : '',
      sub.googlePurchaseToken ? `Google` : '',
    ]
      .filter(Boolean)
      .join(', ');
    LOGGER.info(
      `  Subscription: status=${sub.status} tier=${sub.tier}${platforms ? ` [${platforms}]` : ''}`,
    );
  } else {
    LOGGER.info('  Subscription: none');
  }

  LOGGER.info('\nWhat will happen:');
  LOGGER.info(
    `  • Transferable identities from secondary → primary (provider conflicts: deleted)`,
  );
  LOGGER.info(
    '  • Leagues, memberships, messages, waivers, badges, notifications → primary',
  );
  LOGGER.info('  • Subscriptions and data requests reassigned to primary');
  LOGGER.info(
    '  • Secondary account email anonymised to merged-<id>@deactivated.local',
  );
  LOGGER.info('  • Merge recorded in app_internal.account_merge_log');

  if (preview.identityConflicts.length > 0) {
    LOGGER.warn('\n⚠️  Identity conflicts:');
    for (const c of preview.identityConflicts) {
      LOGGER.warn(`   • ${c}`);
    }
  }

  if (preview.subscriptionConflicts.length > 0) {
    LOGGER.warn(
      '\n⚠️  Billing conflicts (manual action required after merge):',
    );
    for (const c of preview.subscriptionConflicts) {
      LOGGER.warn(`   • ${c}`);
    }
  }
}

export async function executeMerge(
  db: InternalDb,
  primaryId: number,
  secondaryId: number,
  primaryEmail: string,
  secondaryEmail: string,
  primaryIdentities: IdentitySnapshot[],
  secondaryIdentities: IdentitySnapshot[],
): Promise<{ tablesUpdated: string[]; warnings: string[] }> {
  const tablesUpdated: string[] = [];
  const warnings: string[] = [];
  const primaryProviders = new Set(primaryIdentities.map((i) => i.provider));

  await db.transaction(async (tx) => {
    // 1. Identity transfer — move transferable, delete conflicting
    for (const identity of secondaryIdentities) {
      if (primaryProviders.has(identity.provider)) {
        await tx.execute(
          sql`DELETE FROM app_internal.user_identities WHERE id = ${identity.id}`,
        );
        warnings.push(
          `Deleted secondary's ${identity.provider} identity (primary already has this provider)`,
        );
      } else {
        await tx.execute(
          sql`UPDATE app_internal.user_identities SET user_id = ${primaryId} WHERE id = ${identity.id}`,
        );
        tablesUpdated.push(
          `user_identities: transferred ${identity.provider} identity`,
        );
      }
    }

    // 2. League ownership
    const leagueResult = await tx.execute(
      sql`UPDATE leagues SET owner = ${primaryId} WHERE owner = ${secondaryId}`,
    );
    if (leagueResult.rowCount)
      tablesUpdated.push(`leagues: ${leagueResult.rowCount} rows`);

    // 3. League member payment status — before league_members (FK dependency)
    await tx.execute(
      sql`INSERT INTO league_member_payment_status
            (league_id, user_id, season, payment_status, marked_by, updated_at)
          SELECT lmps.league_id, ${primaryId}, lmps.season,
                 lmps.payment_status, lmps.marked_by, lmps.updated_at
          FROM league_member_payment_status lmps
          WHERE lmps.user_id = ${secondaryId}
            AND NOT EXISTS (
              SELECT 1 FROM league_member_payment_status t
              WHERE t.league_id = lmps.league_id
                AND t.user_id = ${primaryId}
                AND t.season = lmps.season
            )`,
    );
    await tx.execute(
      sql`DELETE FROM league_member_payment_status WHERE user_id = ${secondaryId}`,
    );
    await tx.execute(
      sql`UPDATE league_member_payment_status
          SET marked_by = ${primaryId} WHERE marked_by = ${secondaryId}`,
    );

    // 4. League memberships — drop duplicate rows before reassigning
    await tx.execute(
      sql`DELETE FROM league_members
          WHERE user_id = ${secondaryId}
            AND league_id IN (
              SELECT league_id FROM league_members WHERE user_id = ${primaryId}
            )`,
    );
    const memberResult = await tx.execute(
      sql`UPDATE league_members SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (memberResult.rowCount)
      tablesUpdated.push(`league_members: ${memberResult.rowCount} rows`);

    // 5. League messages
    const msgResult = await tx.execute(
      sql`UPDATE league_messages SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (msgResult.rowCount)
      tablesUpdated.push(`league_messages: ${msgResult.rowCount} rows`);

    // 6. Direct messages (sender + recipient)
    const dmFrom = await tx.execute(
      sql`UPDATE direct_messages SET from_user_id = ${primaryId} WHERE from_user_id = ${secondaryId}`,
    );
    const dmTo = await tx.execute(
      sql`UPDATE direct_messages SET to_user_id = ${primaryId} WHERE to_user_id = ${secondaryId}`,
    );
    const dmCount = (dmFrom.rowCount ?? 0) + (dmTo.rowCount ?? 0);
    if (dmCount) tablesUpdated.push(`direct_messages: ${dmCount} rows`);

    // 7. Waiver claims
    const waiverResult = await tx.execute(
      sql`UPDATE waiver_claims SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (waiverResult.rowCount)
      tablesUpdated.push(`waiver_claims: ${waiverResult.rowCount} rows`);

    // 8. Commissioner audit log
    const auditResult = await tx.execute(
      sql`UPDATE commissioner_audit_log SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (auditResult.rowCount)
      tablesUpdated.push(
        `commissioner_audit_log: ${auditResult.rowCount} rows`,
      );

    // 9. Notification preferences + device tokens — secondary's are discarded
    await tx.execute(
      sql`DELETE FROM notification_preferences WHERE user_id = ${secondaryId}`,
    );
    await tx.execute(
      sql`DELETE FROM device_tokens WHERE user_id = ${secondaryId}`,
    );

    // 10. Notification history
    const notifResult = await tx.execute(
      sql`UPDATE notification_history SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (notifResult.rowCount)
      tablesUpdated.push(`notification_history: ${notifResult.rowCount} rows`);

    // 11. User badges — drop duplicate rows before reassigning
    await tx.execute(
      sql`DELETE FROM user_badges
          WHERE user_id = ${secondaryId}
            AND badge_id IN (
              SELECT badge_id FROM user_badges WHERE user_id = ${primaryId}
            )`,
    );
    const badgeResult = await tx.execute(
      sql`UPDATE user_badges SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (badgeResult.rowCount)
      tablesUpdated.push(`user_badges: ${badgeResult.rowCount} rows`);

    // 12. Badge progress — drop duplicate rows before reassigning
    await tx.execute(
      sql`DELETE FROM badge_progress
          WHERE user_id = ${secondaryId}
            AND badge_id IN (
              SELECT badge_id FROM badge_progress WHERE user_id = ${primaryId}
            )`,
    );
    const progressResult = await tx.execute(
      sql`UPDATE badge_progress SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (progressResult.rowCount)
      tablesUpdated.push(`badge_progress: ${progressResult.rowCount} rows`);

    // 13. League activity log
    const activityResult = await tx.execute(
      sql`UPDATE league_activity_log SET actor_user_id = ${primaryId} WHERE actor_user_id = ${secondaryId}`,
    );
    if (activityResult.rowCount)
      tablesUpdated.push(
        `league_activity_log: ${activityResult.rowCount} rows`,
      );

    // 14. Season draft games
    const draftGameResult = await tx.execute(
      sql`UPDATE season_draft_games SET created_by = ${primaryId} WHERE created_by = ${secondaryId}`,
    );
    if (draftGameResult.rowCount)
      tablesUpdated.push(
        `season_draft_games: ${draftGameResult.rowCount} rows`,
      );

    // 15. Season draft players — drop duplicate rows before reassigning
    await tx.execute(
      sql`DELETE FROM season_draft_players
          WHERE user_id = ${secondaryId}
            AND game_id IN (
              SELECT game_id FROM season_draft_players WHERE user_id = ${primaryId}
            )`,
    );
    const draftPlayerResult = await tx.execute(
      sql`UPDATE season_draft_players SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (draftPlayerResult.rowCount)
      tablesUpdated.push(
        `season_draft_players: ${draftPlayerResult.rowCount} rows`,
      );

    // 16. Subscriptions — transfer all rows; billing conflicts flagged above
    await tx.execute(
      sql`UPDATE app_internal.subscriptions SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );

    // 17. User consents — secondary's are discarded; primary's are authoritative
    await tx.execute(
      sql`DELETE FROM app_internal.user_consents WHERE user_id = ${secondaryId}`,
    );

    // 18. Data requests
    const dataReqResult = await tx.execute(
      sql`UPDATE app_internal.data_requests SET user_id = ${primaryId} WHERE user_id = ${secondaryId}`,
    );
    if (dataReqResult.rowCount)
      tablesUpdated.push(`data_requests: ${dataReqResult.rowCount} rows`);

    // 19. Audit log entry
    await tx.execute(
      sql`INSERT INTO app_internal.account_merge_log
            (target_user_id, source_user_id, source_email, target_email,
             merged_by_user_id, tables_updated)
          VALUES (
            ${primaryId}, ${secondaryId},
            ${secondaryEmail}, ${primaryEmail},
            ${primaryId},
            ${JSON.stringify(tablesUpdated)}::jsonb
          )`,
    );

    // 20. Deactivate secondary — anonymise email to free the unique constraint
    const anonymizedEmail = `merged-${secondaryId}@deactivated.local`;
    await tx.execute(
      sql`UPDATE app_internal.users
          SET canonical_email = ${anonymizedEmail},
              username        = ${'merged-' + String(secondaryId)},
              password_hash   = NULL,
              updated_at      = NOW()
          WHERE id = ${secondaryId}`,
    );
    tablesUpdated.push('secondary_account: deactivated');
  });

  return { tablesUpdated, warnings };
}

export async function handleMergeAccounts(
  args: MergeAccountsArgs,
): Promise<void> {
  const { primaryId, secondaryId, dryRun = false, yes = false } = args;

  if (!primaryId || !secondaryId) {
    LOGGER.error('❌ Both --primary-id and --secondary-id are required.');
    process.exit(1);
    return;
  }

  if (primaryId === secondaryId) {
    LOGGER.error('❌ --primary-id and --secondary-id must be different.');
    process.exit(1);
    return;
  }

  const opts = getDbOptions();

  await runWithInternalClient(opts, async (db) => {
    const [
      primary,
      secondary,
      primaryIdentities,
      secondaryIdentities,
      primarySubscription,
      secondarySubscription,
    ] = await Promise.all([
      fetchUserSnapshot(db, primaryId),
      fetchUserSnapshot(db, secondaryId),
      fetchIdentitySnapshots(db, primaryId),
      fetchIdentitySnapshots(db, secondaryId),
      fetchSubscriptionSnapshot(db, primaryId),
      fetchSubscriptionSnapshot(db, secondaryId),
    ]);

    if (!primary) {
      LOGGER.error(`❌ Primary user (id=${primaryId}) not found.`);
      process.exit(1);
      return;
    }
    if (!secondary) {
      LOGGER.error(`❌ Secondary user (id=${secondaryId}) not found.`);
      process.exit(1);
      return;
    }

    if (primary.canonicalEmail.endsWith('@deactivated.local')) {
      LOGGER.error(
        `❌ Primary user (id=${primaryId}) has already been deactivated.`,
      );
      process.exit(1);
      return;
    }
    if (secondary.canonicalEmail.endsWith('@deactivated.local')) {
      LOGGER.error(
        `❌ Secondary user (id=${secondaryId}) has already been deactivated and cannot be merged.`,
      );
      process.exit(1);
      return;
    }

    const preview = buildMergePreview(
      primary,
      secondary,
      primaryIdentities,
      secondaryIdentities,
      primarySubscription,
      secondarySubscription,
    );

    printMergePreview(preview);

    if (dryRun) {
      LOGGER.info(
        '\n🏁 Dry run complete — no changes made. Remove --dry-run to execute.',
      );
      return;
    }

    if (!yes) {
      LOGGER.info(
        '\n⚠️  Pass --yes to confirm the merge. This operation cannot be undone.',
      );
      return;
    }

    if (preview.subscriptionConflicts.length > 0) {
      LOGGER.warn(
        '\n⚠️  Proceeding despite billing conflicts — manual review required after merge.',
      );
    }

    LOGGER.info('\n🔄 Executing merge...');

    const { tablesUpdated, warnings } = await executeMerge(
      db,
      primaryId,
      secondaryId,
      primary.canonicalEmail,
      secondary.canonicalEmail,
      primaryIdentities,
      secondaryIdentities,
    );

    LOGGER.info('\n✅ Merge complete!');
    LOGGER.info('\nData transferred:');
    for (const t of tablesUpdated) {
      LOGGER.info(`  • ${t}`);
    }

    if (warnings.length > 0) {
      LOGGER.warn('\n⚠️  Merge warnings:');
      for (const w of warnings) {
        LOGGER.warn(`  • ${w}`);
      }
    }

    if (preview.subscriptionConflicts.length > 0) {
      LOGGER.warn('\n🔴 BILLING ACTION REQUIRED:');
      for (const c of preview.subscriptionConflicts) {
        LOGGER.warn(`  • ${c}`);
      }
    }

    LOGGER.info(
      `\n📋 Secondary account (id=${secondaryId}) deactivated → primary account (id=${primaryId}) holds all data.`,
    );
  });
}
