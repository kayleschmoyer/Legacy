import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { and, count, eq, sql } from 'drizzle-orm';

interface TestDraftTimerOptions {
  leagueId?: number;
  setDeadline?: number;
  process?: boolean;
  dryRun?: boolean;
  status?: boolean;
}

/**
 * Show the current draft timer status for all in-progress drafts or a specific league.
 */
async function showDraftTimerStatus(leagueId?: number): Promise<void> {
  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    const conditions = [eq(PublicSchema.leagues.draftStatus, 'in-progress')];
    if (leagueId) {
      conditions.push(eq(PublicSchema.leagues.id, leagueId));
    }

    const drafts = await db
      .select({
        draftId: PublicSchema.drafts.id,
        leagueId: PublicSchema.drafts.leagueId,
        leagueName: PublicSchema.leagues.name,
        currentPick: PublicSchema.drafts.currentPick,
        draftStatus: PublicSchema.leagues.draftStatus,
      })
      .from(PublicSchema.drafts)
      .innerJoin(
        PublicSchema.leagues,
        eq(PublicSchema.leagues.id, PublicSchema.drafts.leagueId),
      )
      .where(and(...conditions));

    if (drafts.length === 0) {
      if (leagueId) {
        LOGGER.info(`ℹ️  No in-progress draft found for league ${leagueId}`);

        // Show the league's current draft status
        const [league] = await db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            draftStatus: PublicSchema.leagues.draftStatus,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (league) {
          LOGGER.info(
            `   League "${league.name}" (ID: ${league.id}) — draft status: ${league.draftStatus}`,
          );
        } else {
          LOGGER.warn(`   League ${leagueId} not found`);
        }
      } else {
        LOGGER.info('ℹ️  No in-progress drafts found');
      }
      return;
    }

    LOGGER.info(`\n📋 Draft Timer Status — ${drafts.length} draft(s)`);
    LOGGER.info('='.repeat(70));

    // Fetch raw timer fields separately to avoid drizzle type issues
    const draftIds = drafts.map((d) => d.draftId);
    const timerData = await db.execute(sql`
      SELECT id, pick_time_limit_seconds, current_pick_deadline
      FROM drafts
      WHERE id IN (${sql.join(
        draftIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);
    const timerMap = new Map<
      number,
      { pickTimeLimitSeconds: number; currentPickDeadline: string | null }
    >();
    for (const row of timerData.rows) {
      timerMap.set(row.id as number, {
        pickTimeLimitSeconds: (row.pick_time_limit_seconds as number) ?? 120,
        currentPickDeadline: row.current_pick_deadline as string | null,
      });
    }

    const now = new Date();

    for (const draft of drafts) {
      const timer = timerMap.get(draft.draftId);
      const deadline = timer?.currentPickDeadline
        ? new Date(timer.currentPickDeadline)
        : null;
      const isExpired = deadline ? deadline <= now : false;
      const remainingSec = deadline
        ? Math.round((deadline.getTime() - now.getTime()) / 1000)
        : null;

      LOGGER.info(
        `\n  Draft ${draft.draftId} — League "${draft.leagueName}" (ID: ${draft.leagueId})`,
      );
      LOGGER.info(`    Current Pick:       ${draft.currentPick}`);
      LOGGER.info(
        `    Time Limit:         ${timer?.pickTimeLimitSeconds ?? 120}s`,
      );
      LOGGER.info(
        `    Deadline:           ${deadline ? deadline.toISOString() : '(none — paused or not set)'}`,
      );

      if (deadline) {
        if (isExpired) {
          LOGGER.info(
            `    Status:             ⏰ EXPIRED (${Math.abs(remainingSec ?? 0)}s ago)`,
          );
        } else {
          LOGGER.info(
            `    Status:             ✅ Active (${remainingSec}s remaining)`,
          );
        }
      } else {
        LOGGER.info('    Status:             ⏸️  Paused / No deadline');
      }
    }

    LOGGER.info('');
  });
}

/**
 * Set a short deadline on a draft for testing auto-pick.
 */
async function setShortDeadline(
  leagueId: number,
  seconds: number,
  dryRun: boolean,
): Promise<void> {
  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    // Find the in-progress draft for this league
    const [league] = await db
      .select()
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    if (!league) {
      LOGGER.error(`❌ League ${leagueId} not found`);
      return;
    }

    if (league.draftStatus !== 'in-progress') {
      LOGGER.error(
        `❌ League ${leagueId} ("${league.name}") draft status is "${league.draftStatus}" — must be "in-progress"`,
      );
      return;
    }

    const [draft] = await db
      .select()
      .from(PublicSchema.drafts)
      .where(eq(PublicSchema.drafts.leagueId, leagueId))
      .limit(1);

    if (!draft) {
      LOGGER.error(`❌ No draft record found for league ${leagueId}`);
      return;
    }

    const newDeadline = new Date(Date.now() + seconds * 1000);

    if (dryRun) {
      LOGGER.info(
        `[DRY RUN] Would set deadline for draft ${draft.id} (league ${leagueId}) to ${newDeadline.toISOString()} (${seconds}s from now)`,
      );
      return;
    }

    await db
      .update(PublicSchema.drafts)
      .set({
        currentPickDeadline: newDeadline,
        updatedAt: new Date(),
      })
      .where(eq(PublicSchema.drafts.id, draft.id));

    LOGGER.info(
      `✅ Set deadline for draft ${draft.id} (league ${leagueId}, "${league.name}") to ${newDeadline.toISOString()} (${seconds}s from now)`,
    );
    LOGGER.info(
      `💡 Run with --process to trigger auto-pick processing, or wait for EventBridge (1-min schedule).`,
    );
  });
}

/**
 * Process expired draft picks (same logic as the autoProcessDraftPicks mutation,
 * but executed directly against the database without going through GraphQL).
 */
async function processExpiredPicks(
  leagueId: number | undefined,
  dryRun: boolean,
): Promise<void> {
  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    const now = new Date();
    const leagueFilter = leagueId ? sql`AND d.league_id = ${leagueId}` : sql``;

    const expiredDrafts = await db.execute(sql`
      SELECT d.id AS draft_id, d.league_id, d.current_pick,
             d.draft_order, d.selection_method, d.pick_time_limit_seconds,
             d.current_pick_deadline,
             l.name AS league_name, l.max_roster_size, l.player_pool
      FROM drafts d
      INNER JOIN leagues l ON l.id = d.league_id
      WHERE l.draft_status = 'in-progress'
        AND d.current_pick_deadline IS NOT NULL
        AND d.current_pick_deadline <= ${now}
        ${leagueFilter}
      ORDER BY d.current_pick_deadline ASC
    `);

    if (expiredDrafts.rows.length === 0) {
      LOGGER.info('ℹ️  No expired draft deadlines found');
      if (leagueId) {
        LOGGER.info(`   (filtered to league ${leagueId})`);
      }
      LOGGER.info(
        '\n💡 Use --set-deadline <seconds> to set a short deadline for testing',
      );
      return;
    }

    LOGGER.info(
      `\n🔍 Found ${expiredDrafts.rows.length} draft(s) with expired deadlines`,
    );

    let picksAutoMade = 0;
    let draftsCompleted = 0;
    const errors: string[] = [];

    for (const row of expiredDrafts.rows) {
      const draftId = row.draft_id as number;
      const draftLeagueId = row.league_id as number;
      const leagueName = row.league_name as string;
      const pickTimeLimitSeconds =
        (row.pick_time_limit_seconds as number) ?? 120;
      const maxRosterSize = row.max_roster_size as number;
      const playerPool = row.player_pool as string;
      const deadline = new Date(row.current_pick_deadline as string);
      const agoSec = Math.round((now.getTime() - deadline.getTime()) / 1000);

      LOGGER.info(
        `\n  Draft ${draftId} — League "${leagueName}" (ID: ${draftLeagueId})`,
      );
      LOGGER.info(`    Deadline expired ${agoSec}s ago`);

      if (dryRun) {
        // Show what would happen
        const availablePlayers = await db.execute(sql`
          SELECT p.id, p.first_name, p.last_name
          FROM players p
          WHERE p.id NOT IN (
            SELECT dp.player_id FROM draft_picks dp WHERE dp.draft_id = ${draftId}
          )
          ${
            playerPool !== 'all'
              ? sql`AND p.id IN (
                  SELECT sb.player_id FROM season_batting sb
                  WHERE sb.lg_id = ${playerPool.toUpperCase()}
                )`
              : sql``
          }
          ORDER BY p.id ASC
          LIMIT 3
        `);

        if (availablePlayers.rows.length > 0) {
          const top = availablePlayers.rows[0];
          LOGGER.info(
            `    [DRY RUN] Would auto-pick player ${String(top.id)} (${String(top.first_name)} ${String(top.last_name)})`,
          );
          LOGGER.info(
            `    [DRY RUN] Top 3 available: ${availablePlayers.rows
              .map(
                (p) =>
                  `${String(p.id)} (${String(p.first_name)} ${String(p.last_name)})`,
              )
              .join(', ')}`,
          );
        } else {
          LOGGER.warn(
            `    [DRY RUN] No available players for draft ${draftId}!`,
          );
        }
        picksAutoMade++;
        continue;
      }

      // Actually process the pick (simplified version without WebSocket notifications)
      try {
        const pickResult = await db.transaction(async (tx) => {
          // Lock the draft row — only select columns used in this transaction.
          // FOR NO KEY UPDATE (LS-4692) matches the prod pick paths.
          const draftRows = await tx.execute(
            sql`SELECT id, current_pick, current_pick_deadline FROM drafts WHERE id = ${draftId} FOR NO KEY UPDATE`,
          );
          const draft = draftRows.rows[0] as
            | {
                id: number;
                current_pick: number;
                current_pick_deadline: Date | null;
              }
            | undefined;

          if (!draft) {
            throw new Error(`Draft ${draftId} not found`);
          }

          // Re-check deadline inside transaction
          if (
            !draft.current_pick_deadline ||
            new Date(draft.current_pick_deadline) > now
          ) {
            LOGGER.info(
              `    ⏭️  Deadline no longer expired (pick was made concurrently), skipping`,
            );
            return null;
          }

          // Get current pick info via draft_order
          const draftTeams = await tx
            .select()
            .from(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, draftId));

          if (draftTeams.length === 0) {
            throw new Error(
              `Draft ${draftId} has no draft_teams — the draft was not properly initialized via initializeDraft`,
            );
          }

          const numTeams = draftTeams.length;
          // current_pick tracks the LAST completed pick (0 = no picks yet)
          // The next pick to make is current_pick + 1
          const nextOverall = draft.current_pick + 1;
          const round = Math.floor((nextOverall - 1) / numTeams) + 1;
          const pickInRound = ((nextOverall - 1) % numTeams) + 1;

          // Build team order from draft_teams table (sorted by draft_order position)
          // The drafts.draft_order column stores the style ('snake'/'linear'), not team IDs
          const draftStyle = row.draft_order as string;
          const sortedTeams = [...draftTeams].sort(
            (a, b) => (a.draftOrder ?? 0) - (b.draftOrder ?? 0),
          );
          const teamOrder = sortedTeams.map((dt) => dt.teamId);

          // Snake draft: reverse every other round
          let orderIndex = pickInRound - 1;
          if (draftStyle === 'snake' && round % 2 === 0) {
            orderIndex = numTeams - pickInRound;
          }
          const currentTeamId = teamOrder[orderIndex];

          if (!currentTeamId) {
            throw new Error(
              `Could not determine team for pick ${nextOverall} (round ${round}, pick ${pickInRound})`,
            );
          }

          // Find available player
          const availablePlayers = await tx.execute(sql`
            SELECT p.id, p.first_name, p.last_name
            FROM players p
            WHERE p.id NOT IN (
              SELECT dp.player_id FROM draft_picks dp WHERE dp.draft_id = ${draftId}
            )
            ${
              playerPool !== 'all'
                ? sql`AND p.id IN (
                    SELECT sb.player_id FROM season_batting sb
                    WHERE sb.lg_id = ${playerPool.toUpperCase()}
                  )`
                : sql``
            }
            ORDER BY p.id ASC
            LIMIT 1
          `);

          if (availablePlayers.rows.length === 0) {
            throw new Error(`No available players for draft ${draftId}`);
          }

          const autoPlayer = availablePlayers.rows[0];
          const autoPlayerId = autoPlayer.id as number;

          // Check roster limit
          const [rosterCount] = await tx
            .select({ count: count() })
            .from(PublicSchema.teamMembers)
            .where(
              and(
                eq(PublicSchema.teamMembers.teamId, currentTeamId),
                eq(PublicSchema.teamMembers.leagueId, draftLeagueId),
              ),
            );

          if (rosterCount && Number(rosterCount.count) >= maxRosterSize) {
            throw new Error(
              `Team ${currentTeamId} roster is full (${maxRosterSize}) in draft ${draftId}`,
            );
          }

          const pickNow = new Date();

          // Create the auto pick
          await tx.insert(PublicSchema.draftPicks).values({
            draftId,
            teamId: currentTeamId,
            playerId: autoPlayerId,
            round,
            pickNumber: pickInRound,
            overallPick: nextOverall,
            pickedAt: pickNow,
          });

          // Check if draft is complete
          const totalPicks = numTeams * maxRosterSize;
          const isDraftComplete = nextOverall >= totalPicks;

          const nextDeadline = isDraftComplete
            ? null
            : new Date(pickNow.getTime() + pickTimeLimitSeconds * 1000);

          // Update draft state
          await tx
            .update(PublicSchema.drafts)
            .set({
              currentPick: nextOverall,
              currentPickDeadline: nextDeadline,
              updatedAt: pickNow,
              ...(isDraftComplete ? { draftCompletedAt: pickNow } : {}),
            })
            .where(eq(PublicSchema.drafts.id, draftId));

          if (isDraftComplete) {
            await tx
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'completed' })
              .where(eq(PublicSchema.leagues.id, draftLeagueId));
          }

          // Add to roster
          await tx.insert(PublicSchema.teamMembers).values({
            teamId: currentTeamId,
            leagueId: draftLeagueId,
            playerId: autoPlayerId,
            draftRound: round,
            draftPick: pickInRound,
            acquisitionType: 'draft',
          });

          return {
            autoPlayerId,
            playerName: `${String(autoPlayer.first_name)} ${String(autoPlayer.last_name)}`,
            teamId: currentTeamId,
            round,
            pickNumber: pickInRound,
            overallPick: nextOverall,
            isDraftComplete,
            nextDeadline,
          };
        });

        if (!pickResult) {
          continue;
        }

        picksAutoMade++;
        LOGGER.info(
          `    ✅ Auto-picked: ${pickResult.playerName} (ID: ${pickResult.autoPlayerId}) → Team ${pickResult.teamId}`,
        );
        LOGGER.info(
          `       Round ${pickResult.round}, Pick ${pickResult.pickNumber} (Overall #${pickResult.overallPick})`,
        );

        if (pickResult.isDraftComplete) {
          draftsCompleted++;
          LOGGER.info(`    🏁 Draft COMPLETED!`);
        } else if (pickResult.nextDeadline) {
          LOGGER.info(
            `    ⏰ Next deadline: ${pickResult.nextDeadline.toISOString()} (${pickTimeLimitSeconds}s)`,
          );
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        LOGGER.error(`    ❌ Error: ${errMsg}`);
        errors.push(`Draft ${draftId}: ${errMsg}`);
      }
    }

    // Summary
    LOGGER.info('\n' + '='.repeat(70));
    LOGGER.info('📊 Summary');
    LOGGER.info(`   Picks auto-made:   ${picksAutoMade}`);
    LOGGER.info(`   Drafts completed:  ${draftsCompleted}`);
    if (errors.length > 0) {
      LOGGER.info(`   Errors:            ${errors.length}`);
      for (const err of errors) {
        LOGGER.error(`     • ${err}`);
      }
    }

    if (dryRun) {
      LOGGER.info(
        '\n🧪 DRY RUN — no changes were made. Remove --dry-run to execute.',
      );
    }
  });
}

/**
 * CLI handler for test-draft-timer command.
 */
export async function handleTestDraftTimer(
  options: TestDraftTimerOptions,
): Promise<void> {
  const {
    leagueId,
    setDeadline,
    process: processFlag,
    dryRun = false,
    status: statusFlag,
  } = options;

  LOGGER.info('⏱️  Draft Timer Test Tool');
  LOGGER.info('========================\n');

  if (dryRun) {
    LOGGER.info('🧪 DRY RUN MODE — no changes will be made\n');
  }

  // Default to status mode if no action flags are given
  const showStatus = statusFlag || (!setDeadline && !processFlag);

  if (showStatus && !setDeadline && !processFlag) {
    await showDraftTimerStatus(leagueId);
    return;
  }

  // Set a short deadline on a specific league's draft
  if (setDeadline !== undefined) {
    if (!leagueId) {
      LOGGER.error('❌ --league-id is required when using --set-deadline');
      process.exit(1);
    }
    await setShortDeadline(leagueId, setDeadline, dryRun);
  }

  // Process expired picks
  if (processFlag) {
    await processExpiredPicks(leagueId, dryRun);
  }

  // Show final status
  if (statusFlag && (setDeadline || processFlag)) {
    LOGGER.info('\n--- Final Status ---');
    await showDraftTimerStatus(leagueId);
  }
}
