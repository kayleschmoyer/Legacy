/**
 * Waiver Claim Processor Service
 *
 * Business logic for processing pending waiver claims. Handles priority
 * resolution (standard waiver order vs FAAB bidding), roster size
 * enforcement, drop-player management, waiver-order rotation, and
 * post-processing notifications (WebSocket + league chat).
 */

import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
import type { WebSocketNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { insertActivityLog } from './activity-log';
import {
  addPlayerToRoster,
  checkRosterCapacity,
  isPlayerOnRoster,
} from './roster-service';
import {
  addClaimedPlayerToCurrentMatchup,
  validateFaabBudget,
} from '../schema/waivers/helpers';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProcessWaiverClaimsOptions {
  leagueId?: number | null;
}

export interface ProcessWaiverClaimsResult {
  processed: number;
  succeeded: number;
  failed: number;
}

interface SucceededClaim {
  leagueId: number;
  teamId: number;
  userId: number;
  playerId: number;
  dropPlayerId: number | null;
  faabBid: number | null;
  waiverType: string;
}

type PendingClaim = typeof PublicSchema.waiverClaims.$inferSelect;

interface TeamSettings {
  id: number;
  waiverOrder: number | null;
  faabBudget: number | null;
}

interface LeagueSalarySettings {
  salaryCapEnabled: boolean;
  minSalary: number;
  seasonNumber: number;
}

// ── Service ────────────────────────────────────────────────────────────────

export class WaiverClaimProcessor {
  constructor(
    private readonly db: GenericDatabase<typeof PublicSchema>,
    private readonly notificationService?: WebSocketNotificationService | null,
  ) {}

  /**
   * Process all pending waiver claims, optionally scoped to a single league.
   */
  async process(
    opts: ProcessWaiverClaimsOptions = {},
  ): Promise<ProcessWaiverClaimsResult> {
    const { db } = this;
    let succeeded = 0;
    let failed = 0;
    const succeededLeagueIds = new Set<number>();
    const succeededClaims: SucceededClaim[] = [];

    // 1. Fetch pending claims
    const pendingClaims = await this.fetchPendingClaims(opts.leagueId ?? null);
    if (pendingClaims.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const leagueIds = [...new Set(pendingClaims.map((c) => c.leagueId))];

    // 2. Fetch league + team settings
    const leagueSettingsMap = await this.fetchLeagueSettings(leagueIds);
    const teamIds = [...new Set(pendingClaims.map((c) => c.teamId))];
    const teamSettingsMap = await this.fetchTeamSettings(teamIds);

    LOGGER.info('Processing waiver claims', {
      count: pendingClaims.length,
      leagueId: opts.leagueId ?? 'all',
      leagues: leagueIds,
    });

    // 3. Group claims by league → by player
    const claimsByLeague = this.groupByLeague(pendingClaims);

    // 4. Process each league's claims
    for (const [leagueId, leagueClaims] of claimsByLeague) {
      const settings = leagueSettingsMap.get(leagueId);
      const maxRoster = settings?.maxRosterSize ?? 25;
      const waiverType = settings?.waiverType ?? 'standard';
      const leagueSalarySettings: LeagueSalarySettings | null =
        settings != null
          ? {
              salaryCapEnabled: settings.salaryCapEnabled,
              minSalary: settings.minSalary,
              seasonNumber: settings.seasonNumber,
            }
          : null;

      const claimsByPlayer = this.groupByPlayer(leagueClaims);

      for (const [, playerClaims] of claimsByPlayer) {
        this.sortByPriority(playerClaims, waiverType, teamSettingsMap);

        let claimed = false;
        for (const claim of playerClaims) {
          if (claimed) {
            await this.cancelLosingClaim(claim);
            failed++;
            continue;
          }

          try {
            const result = await this.processSingleClaim(
              claim,
              maxRoster,
              waiverType,
              leagueSalarySettings,
            );

            if (result.outcome === 'failed') {
              failed++;
              void insertActivityLog(
                { db: this.db },
                {
                  leagueId: claim.leagueId,
                  teamId: claim.teamId,
                  actorUserId: claim.userId,
                  eventType: 'waiver_claim_rejected',
                  payload: {
                    claimId: claim.id,
                    playerId: claim.playerId,
                    reason: result.reason ?? 'Claim could not be fulfilled',
                  },
                },
              );
              // Check if it's a "player taken" failure — block remaining claims
              claimed = await isPlayerOnRoster(
                this.db,
                claim.leagueId,
                claim.playerId,
              );
              continue;
            }

            succeeded++;
            claimed = true;
            succeededLeagueIds.add(claim.leagueId);
            succeededClaims.push({
              leagueId: claim.leagueId,
              teamId: claim.teamId,
              userId: claim.userId,
              playerId: claim.playerId,
              dropPlayerId: claim.dropPlayerId ?? null,
              faabBid: claim.faabBid ?? null,
              waiverType,
            });

            void insertActivityLog(
              { db: this.db },
              {
                leagueId: claim.leagueId,
                teamId: claim.teamId,
                actorUserId: claim.userId,
                eventType: 'waiver_claim_approved',
                payload: {
                  claimId: claim.id,
                  playerId: claim.playerId,
                  dropPlayerId: claim.dropPlayerId ?? null,
                  faabBid: claim.faabBid ?? null,
                  waiverType,
                },
              },
            );

            // Rotate waiver order for standard waivers
            if (waiverType === 'standard') {
              await this.rotateWaiverOrder(claim, teamSettingsMap);
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';

            LOGGER.error('Error processing waiver claim', {
              claimId: claim.id,
              error: errorMessage,
            });

            await db
              .update(PublicSchema.waiverClaims)
              .set({
                status: 'failed',
                errorMessage,
                processedAt: new Date(),
              })
              .where(eq(PublicSchema.waiverClaims.id, claim.id));

            void insertActivityLog(
              { db: this.db },
              {
                leagueId: claim.leagueId,
                teamId: claim.teamId,
                actorUserId: claim.userId,
                eventType: 'waiver_claim_rejected',
                payload: {
                  claimId: claim.id,
                  playerId: claim.playerId,
                  reason: errorMessage,
                },
              },
            );

            failed++;
          }
        }
      }
    }

    // 5. Post-processing notifications
    await this.sendNotifications(succeededLeagueIds, succeededClaims);

    const totalProcessed = succeeded + failed;
    LOGGER.info('Waiver claim processing complete', {
      processed: totalProcessed,
      succeeded,
      failed,
    });

    return { processed: totalProcessed, succeeded, failed };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async fetchPendingClaims(
    leagueId: number | null,
  ): Promise<PendingClaim[]> {
    const conditions = [eq(PublicSchema.waiverClaims.status, 'pending')];
    if (leagueId) {
      conditions.push(eq(PublicSchema.waiverClaims.leagueId, leagueId));
    }
    return this.db
      .select()
      .from(PublicSchema.waiverClaims)
      .where(and(...conditions))
      .limit(500);
  }

  private async fetchLeagueSettings(leagueIds: number[]) {
    const rows = await this.db
      .select({
        id: PublicSchema.leagues.id,
        maxRosterSize: PublicSchema.leagues.maxRosterSize,
        waiverType: PublicSchema.leagues.waiverType,
        salaryCapEnabled: PublicSchema.leagues.salaryCapEnabled,
        minSalary: PublicSchema.leagues.minSalary,
        seasonNumber: PublicSchema.leagues.seasonNumber,
      })
      .from(PublicSchema.leagues)
      .where(inArray(PublicSchema.leagues.id, leagueIds));
    return new Map(rows.map((l) => [l.id, l]));
  }

  private async fetchTeamSettings(
    teamIds: number[],
  ): Promise<Map<number, TeamSettings>> {
    const rows = await this.db
      .select({
        id: PublicSchema.teams.id,
        waiverOrder: PublicSchema.teams.waiverOrder,
        faabBudget: PublicSchema.teams.faabBudget,
      })
      .from(PublicSchema.teams)
      .where(inArray(PublicSchema.teams.id, teamIds));
    return new Map(rows.map((t) => [t.id, t]));
  }

  private groupByLeague(claims: PendingClaim[]) {
    const map = new Map<number, PendingClaim[]>();
    for (const claim of claims) {
      const existing = map.get(claim.leagueId) ?? [];
      existing.push(claim);
      map.set(claim.leagueId, existing);
    }
    return map;
  }

  private groupByPlayer(claims: PendingClaim[]) {
    const map = new Map<number, PendingClaim[]>();
    for (const claim of claims) {
      const existing = map.get(claim.playerId) ?? [];
      existing.push(claim);
      map.set(claim.playerId, existing);
    }
    return map;
  }

  private sortByPriority(
    claims: PendingClaim[],
    waiverType: string,
    teamSettingsMap: Map<number, TeamSettings>,
  ) {
    claims.sort((a, b) => {
      if (waiverType === 'faab') {
        const bidA = a.faabBid ?? 0;
        const bidB = b.faabBid ?? 0;
        if (bidB !== bidA) return bidB - bidA;
        const orderA = teamSettingsMap.get(a.teamId)?.waiverOrder ?? 999;
        const orderB = teamSettingsMap.get(b.teamId)?.waiverOrder ?? 999;
        return orderA - orderB;
      }
      const orderA = teamSettingsMap.get(a.teamId)?.waiverOrder ?? 999;
      const orderB = teamSettingsMap.get(b.teamId)?.waiverOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private async cancelLosingClaim(claim: PendingClaim) {
    await this.db
      .update(PublicSchema.waiverClaims)
      .set({
        status: 'cancelled',
        errorMessage: 'Player was claimed by another team',
        processedAt: new Date(),
      })
      .where(eq(PublicSchema.waiverClaims.id, claim.id));
  }

  /**
   * Process a single waiver claim. Returns an outcome object with 'succeeded'
   * or 'failed', plus an optional human-readable reason on failure.
   */
  private async processSingleClaim(
    claim: PendingClaim,
    maxRoster: number,
    waiverType: string,
    leagueSalarySettings: LeagueSalarySettings | null = null,
  ): Promise<{ outcome: 'succeeded' | 'failed'; reason?: string }> {
    const { db } = this;

    // Mark as processing
    await db
      .update(PublicSchema.waiverClaims)
      .set({ status: 'processing' })
      .where(eq(PublicSchema.waiverClaims.id, claim.id));

    // Check player is still available
    if (await isPlayerOnRoster(db, claim.leagueId, claim.playerId)) {
      await this.failClaim(claim.id, 'Player is no longer available');
      return { outcome: 'failed', reason: 'Player is no longer available' };
    }

    // FAAB: verify budget at processing time (accounts for all committed pending
    // bids — same logic as submission-time validation in mutations.ts).
    // The current claim is already in 'processing' state at this point, so it
    // is naturally excluded from the committed-pending sum.
    if (waiverType === 'faab' && claim.faabBid != null && claim.faabBid > 0) {
      try {
        await validateFaabBudget(db, claim.teamId, claim.faabBid);
      } catch (err) {
        const faabReason =
          err instanceof Error ? err.message : 'Insufficient FAAB budget';
        await this.failClaim(claim.id, faabReason);
        return { outcome: 'failed', reason: faabReason };
      }
    }

    // Roster size enforcement + drop handling
    const dropResult = await this.handleRosterAndDrop(claim, maxRoster);
    if (dropResult === 'failed')
      return { outcome: 'failed', reason: 'Roster or drop player issue' };

    // Add player to roster
    // In salary-cap FAAB leagues the winning bid becomes the player's salary.
    const rosterSalary =
      leagueSalarySettings?.salaryCapEnabled &&
      waiverType === 'faab' &&
      claim.faabBid != null
        ? claim.faabBid
        : null;
    await addPlayerToRoster(db, {
      teamId: claim.teamId,
      leagueId: claim.leagueId,
      playerId: claim.playerId,
      acquisitionType: 'waiver',
      salary: rosterSalary,
    });

    // Salary cap: upsert player_salaries so the player's salary is tracked
    // league-wide (covers free agents too, not just rostered players).
    if (rosterSalary != null && leagueSalarySettings != null) {
      await db
        .insert(PublicSchema.playerSalaries)
        .values({
          leagueId: claim.leagueId,
          playerId: claim.playerId,
          currentSalary: rosterSalary,
          initialSalary: rosterSalary,
          acquisitionType: 'waiver',
          yearAcquired: leagueSalarySettings.seasonNumber,
          freeAgentYears: 0,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            PublicSchema.playerSalaries.leagueId,
            PublicSchema.playerSalaries.playerId,
          ],
          set: {
            currentSalary: rosterSalary,
            initialSalary: rosterSalary,
            acquisitionType: 'waiver',
            yearAcquired: leagueSalarySettings.seasonNumber,
            freeAgentYears: 0,
            updatedAt: new Date(),
          },
        });
    }

    // Season selection + matchup_players insertion for current week
    try {
      await addClaimedPlayerToCurrentMatchup(
        db,
        claim.leagueId,
        claim.teamId,
        claim.playerId,
      );
    } catch (matchupError) {
      LOGGER.warn('Failed to add waiver-claimed player to matchup', {
        claimId: claim.id,
        playerId: claim.playerId,
        error:
          matchupError instanceof Error
            ? matchupError.message
            : String(matchupError),
      });
    }

    // Mark claim as completed
    await db
      .update(PublicSchema.waiverClaims)
      .set({ status: 'completed', processedAt: new Date() })
      .where(eq(PublicSchema.waiverClaims.id, claim.id));

    LOGGER.info('Waiver claim processed successfully', {
      claimId: claim.id,
      leagueId: claim.leagueId,
      teamId: claim.teamId,
      playerId: claim.playerId,
      waiverType,
      faabBid: claim.faabBid,
    });

    // FAAB: deduct bid
    if (waiverType === 'faab' && claim.faabBid != null && claim.faabBid > 0) {
      await db
        .update(PublicSchema.teams)
        .set({
          faabBudget: sql`${PublicSchema.teams.faabBudget} - ${claim.faabBid}`,
        })
        .where(eq(PublicSchema.teams.id, claim.teamId));

      LOGGER.info('Deducted FAAB bid', {
        teamId: claim.teamId,
        bid: claim.faabBid,
      });
    }

    return { outcome: 'succeeded' };
  }

  private async handleRosterAndDrop(
    claim: PendingClaim,
    maxRoster: number,
  ): Promise<'ok' | 'failed'> {
    const { db } = this;

    const { isFull } = await checkRosterCapacity(
      db,
      claim.teamId,
      claim.leagueId,
      maxRoster,
    );

    if (isFull) {
      if (!claim.dropPlayerId) {
        await this.failClaim(
          claim.id,
          'Roster is full and no drop player was specified',
        );
        return 'failed';
      }

      const dropped = await this.dropPlayer(claim);
      if (!dropped) {
        await this.failClaim(claim.id, 'Drop player is no longer on roster');
        return 'failed';
      }
    } else if (claim.dropPlayerId) {
      // Drop was provided but roster isn't full — still honour it
      await this.dropPlayer(claim);
    }

    return 'ok';
  }

  private async dropPlayer(claim: PendingClaim): Promise<boolean> {
    if (!claim.dropPlayerId) return false;

    const dropMember = await this.db
      .select({ id: PublicSchema.teamMembers.id })
      .from(PublicSchema.teamMembers)
      .where(
        and(
          eq(PublicSchema.teamMembers.teamId, claim.teamId),
          eq(PublicSchema.teamMembers.leagueId, claim.leagueId),
          eq(PublicSchema.teamMembers.playerId, claim.dropPlayerId),
        ),
      )
      .limit(1);

    if (dropMember.length === 0) return false;

    await this.db
      .delete(PublicSchema.teamMembers)
      .where(eq(PublicSchema.teamMembers.id, dropMember[0].id));

    LOGGER.info('Dropped player for waiver claim', {
      claimId: claim.id,
      droppedPlayerId: claim.dropPlayerId,
      teamId: claim.teamId,
    });

    return true;
  }

  private async failClaim(claimId: number, errorMessage: string) {
    await this.db
      .update(PublicSchema.waiverClaims)
      .set({ status: 'failed', errorMessage, processedAt: new Date() })
      .where(eq(PublicSchema.waiverClaims.id, claimId));
  }

  private async rotateWaiverOrder(
    claim: PendingClaim,
    teamSettingsMap: Map<number, TeamSettings>,
  ) {
    const { db } = this;
    const winnerOrder = teamSettingsMap.get(claim.teamId)?.waiverOrder;
    if (winnerOrder == null) return;

    // Move all teams with higher order numbers up by one
    await db.execute(sql`
      UPDATE teams
      SET waiver_order = waiver_order - 1
      WHERE league_id = ${claim.leagueId}
        AND waiver_order > ${winnerOrder}
    `);

    // Move winner to last
    const maxOrder = await db
      .select({ maxOrder: sql<number>`MAX(waiver_order)` })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, claim.leagueId));
    const lastOrder = (Number(maxOrder[0]?.maxOrder) || 0) + 1;

    await db
      .update(PublicSchema.teams)
      .set({ waiverOrder: lastOrder })
      .where(eq(PublicSchema.teams.id, claim.teamId));

    LOGGER.info('Rotated waiver order', {
      teamId: claim.teamId,
      previousOrder: winnerOrder,
      newOrder: lastOrder,
      leagueId: claim.leagueId,
    });

    // Refresh team settings for remaining claims in this batch
    const updatedTeams = await db
      .select({
        id: PublicSchema.teams.id,
        waiverOrder: PublicSchema.teams.waiverOrder,
        faabBudget: PublicSchema.teams.faabBudget,
      })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, claim.leagueId));
    for (const ut of updatedTeams) {
      teamSettingsMap.set(ut.id, ut);
    }
  }

  private async sendNotifications(
    succeededLeagueIds: Set<number>,
    succeededClaims: SucceededClaim[],
  ) {
    const { db } = this;
    const notificationService = this.notificationService ?? null;

    // WebSocket roster-update notifications
    if (notificationService && succeededLeagueIds.size > 0) {
      for (const lid of succeededLeagueIds) {
        try {
          await notificationService.notifyRosterUpdate(lid);
        } catch (err) {
          LOGGER.warn('Failed to send roster update notification', {
            leagueId: lid,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Chat notifications
    if (succeededClaims.length === 0) return;

    // Batch-resolve player names
    const allPlayerIds = [
      ...new Set(
        succeededClaims.flatMap((c) =>
          c.dropPlayerId != null ? [c.playerId, c.dropPlayerId] : [c.playerId],
        ),
      ),
    ];
    const playerRows = await db
      .select({
        id: PublicSchema.players.id,
        firstName: PublicSchema.players.firstName,
        lastName: PublicSchema.players.lastName,
      })
      .from(PublicSchema.players)
      .where(inArray(PublicSchema.players.id, allPlayerIds));
    const playerNameMap = new Map(
      playerRows.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]),
    );

    // Batch-resolve team names
    const allTeamIds = [...new Set(succeededClaims.map((c) => c.teamId))];
    const teamRows = await db
      .select({ id: PublicSchema.teams.id, name: PublicSchema.teams.name })
      .from(PublicSchema.teams)
      .where(inArray(PublicSchema.teams.id, allTeamIds));
    const teamNameMap = new Map(teamRows.map((t) => [t.id, t.name]));

    const notifyService = notificationService;

    for (const sc of succeededClaims) {
      const teamName = teamNameMap.get(sc.teamId) ?? `Team ${sc.teamId}`;
      const playerName =
        playerNameMap.get(sc.playerId) ?? `Player ${sc.playerId}`;
      const dropName =
        sc.dropPlayerId != null
          ? (playerNameMap.get(sc.dropPlayerId) ?? `Player ${sc.dropPlayerId}`)
          : null;

      let messageText = `🔄 ${teamName} claimed ${playerName}`;
      if (dropName) messageText += `, dropped ${dropName}`;
      if (sc.waiverType === 'faab' && sc.faabBid != null) {
        messageText += ` ($${sc.faabBid} bid)`;
      }

      try {
        const waiverMetadata: Record<string, unknown> = {
          teamName,
          playerName,
          ...(dropName ? { dropName } : {}),
          ...(sc.waiverType === 'faab' && sc.faabBid != null
            ? { faabBid: sc.faabBid }
            : {}),
        };

        const [chatMsg] = await db
          .insert(PublicSchema.leagueMessages)
          .values({
            leagueId: sc.leagueId,
            userId: null,
            messageText,
            messageType: 'waiver',
            metadata: waiverMetadata,
          })
          .returning();

        if (notifyService && chatMsg) {
          notifyService
            .notifyLeagueChatMessage(sc.leagueId, {
              leagueId: sc.leagueId,
              messageId: chatMsg.id,
              senderId: null,
              senderUsername: 'Waiver Wire',
              messageText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
              messageType: 'waiver',
              metadata: waiverMetadata,
            })
            .catch((err: unknown) => {
              LOGGER.warn(
                'Failed to send league chat WS notification for waiver claim',
                { leagueId: sc.leagueId, err },
              );
            });
        }
      } catch (chatErr) {
        LOGGER.warn('Failed to insert waiver chat notification', {
          leagueId: sc.leagueId,
          teamId: sc.teamId,
          playerId: sc.playerId,
          error: chatErr instanceof Error ? chatErr.message : String(chatErr),
        });
      }
    }
  }
}
