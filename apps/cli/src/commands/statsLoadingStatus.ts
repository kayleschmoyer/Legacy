import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { count, eq, sql } from 'drizzle-orm';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';

const SQS_QUEUE_URL = process.env.SQS_LOAD_GAME_STATS_URL;

interface StatsLoadingStatusArgs {
  league?: number;
  matchup?: number;
  watch?: boolean;
  interval?: number;
}

interface QueueDepth {
  available: number;
  inFlight: number;
  dlq: number;
}

interface LeagueSummary {
  leagueId: number;
  leagueName: string;
  matchupId: number;
  pending: number;
  loading: number;
  completed: number;
  failed: number;
  total: number;
}

interface PlayerDetail {
  mpgId: number;
  brefId: string;
  firstName: string;
  lastName: string;
  gameNum: number;
  gameIdentifier: string | null;
  status: string | null;
  fieldingPos: string | null;
}

async function getQueueDepth(): Promise<QueueDepth | null> {
  if (!SQS_QUEUE_URL) return null;
  try {
    const sqs = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    const mainAttrs = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: SQS_QUEUE_URL,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
        ],
      }),
    );

    // DLQ
    const dlqUrl = SQS_QUEUE_URL.replace(/\.fifo$/, '-dlq.fifo');
    let dlqCount = 0;
    try {
      const dlqAttrs = await sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: dlqUrl,
          AttributeNames: ['ApproximateNumberOfMessages'],
        }),
      );
      dlqCount = parseInt(
        dlqAttrs.Attributes?.ApproximateNumberOfMessages ?? '0',
        10,
      );
    } catch {
      // DLQ may not exist
    }

    return {
      available: parseInt(
        mainAttrs.Attributes?.ApproximateNumberOfMessages ?? '0',
        10,
      ),
      inFlight: parseInt(
        mainAttrs.Attributes?.ApproximateNumberOfMessagesNotVisible ?? '0',
        10,
      ),
      dlq: dlqCount,
    };
  } catch {
    return null;
  }
}

function progressBar(completed: number, total: number, width = 30): string {
  if (total === 0) return '░'.repeat(width);
  const ratio = completed / total;
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

async function displayStatus(args: StatsLoadingStatusArgs): Promise<void> {
  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    // ── League/Matchup Summary ──────────────────────────────────────
    const summaryRows = (await db
      .select({
        leagueId: PublicSchema.matchups.leagueId,
        leagueName: PublicSchema.leagues.name,
        matchupId: PublicSchema.matchups.id,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${PublicSchema.matchupPlayerGames.statsLoadingStatus} = 'pending')`,
        loading: sql<number>`COUNT(*) FILTER (WHERE ${PublicSchema.matchupPlayerGames.statsLoadingStatus} = 'loading')`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${PublicSchema.matchupPlayerGames.statsLoadingStatus} = 'completed')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${PublicSchema.matchupPlayerGames.statsLoadingStatus} = 'failed')`,
        total: count(),
      })
      .from(PublicSchema.matchupPlayerGames)
      .innerJoin(
        PublicSchema.matchupPlayers,
        eq(
          PublicSchema.matchupPlayerGames.matchupPlayerId,
          PublicSchema.matchupPlayers.id,
        ),
      )
      .innerJoin(
        PublicSchema.matchups,
        eq(PublicSchema.matchupPlayers.matchupId, PublicSchema.matchups.id),
      )
      .innerJoin(
        PublicSchema.leagues,
        eq(PublicSchema.matchups.leagueId, PublicSchema.leagues.id),
      )
      .where(
        args.league
          ? args.matchup
            ? eq(PublicSchema.matchups.id, args.matchup)
            : eq(PublicSchema.matchups.leagueId, args.league)
          : args.matchup
            ? eq(PublicSchema.matchups.id, args.matchup)
            : undefined,
      )
      .groupBy(
        PublicSchema.matchups.leagueId,
        PublicSchema.leagues.name,
        PublicSchema.matchups.id,
      )
      .orderBy(
        PublicSchema.matchups.leagueId,
        PublicSchema.matchups.id,
      )) as LeagueSummary[];

    if (summaryRows.length === 0) {
      LOGGER.info('No matchup player games found.');
      return;
    }

    // ── Global totals ────────────────────────────────────────────────
    const totals = summaryRows.reduce(
      (acc, r) => ({
        pending: acc.pending + Number(r.pending),
        loading: acc.loading + Number(r.loading),
        completed: acc.completed + Number(r.completed),
        failed: acc.failed + Number(r.failed),
        total: acc.total + Number(r.total),
      }),
      { pending: 0, loading: 0, completed: 0, failed: 0, total: 0 },
    );

    const pct = totals.total
      ? ((totals.completed / totals.total) * 100).toFixed(1)
      : '0.0';

    // ── Header ────────────────────────────────────────────────────────
    LOGGER.info('');
    LOGGER.info(
      '═══════════════════════════════════════════════════════════════',
    );
    LOGGER.info('  📊 Stats Loading Status');
    LOGGER.info(
      '═══════════════════════════════════════════════════════════════',
    );
    LOGGER.info('');

    // ── Overall progress ──────────────────────────────────────────────
    const bar = progressBar(totals.completed, totals.total, 40);
    LOGGER.info(`  Progress: [${bar}] ${pct}%`);
    LOGGER.info('');
    LOGGER.info(
      `  ✅ Completed:  ${totals.completed.toString().padStart(4)}    ⏳ Loading: ${totals.loading.toString().padStart(4)}`,
    );
    LOGGER.info(
      `  ⏸️  Pending:    ${totals.pending.toString().padStart(4)}    ❌ Failed:  ${totals.failed.toString().padStart(4)}`,
    );
    LOGGER.info(`  📦 Total:      ${totals.total.toString().padStart(4)}`);
    LOGGER.info('');

    // ── SQS Queue ─────────────────────────────────────────────────────
    const queue = await getQueueDepth();
    if (queue) {
      const qTotal = queue.available + queue.inFlight;
      LOGGER.info('  SQS Queue:');
      LOGGER.info(
        `    📬 Waiting:     ${queue.available.toString().padStart(4)}    ⚙️  Processing: ${queue.inFlight.toString().padStart(4)}`,
      );
      if (queue.dlq > 0) {
        LOGGER.info(`    ⚠️  DLQ:         ${queue.dlq.toString().padStart(4)}`);
      }
      if (qTotal > 0) {
        // ~2 min per batch of 5, so ~24s per player game
        const etaMin = Math.ceil((qTotal * 24) / 60);
        LOGGER.info(`    ⏰ ETA:         ~${etaMin} min`);
      }
      LOGGER.info('');
    }

    // ── Per-league / per-matchup breakdown ─────────────────────────────
    LOGGER.info(
      '───────────────────────────────────────────────────────────────',
    );
    LOGGER.info('  League / Matchup Breakdown');
    LOGGER.info(
      '───────────────────────────────────────────────────────────────',
    );

    let currentLeague = -1;
    for (const row of summaryRows) {
      const rid = Number(row.leagueId);
      if (rid !== currentLeague) {
        currentLeague = rid;
        LOGGER.info('');
        LOGGER.info(`  🏆 League ${rid}: ${row.leagueName}`);
      }

      const mCompleted = Number(row.completed);
      const mTotal = Number(row.total);
      const mPct = mTotal ? ((mCompleted / mTotal) * 100).toFixed(0) : '0';
      const mBar = progressBar(mCompleted, mTotal, 20);
      const mFailed = Number(row.failed);
      const mLoading = Number(row.loading);
      const mPending = Number(row.pending);

      let suffix = '';
      if (mFailed > 0) suffix += ` ❌${mFailed}`;
      if (mLoading > 0) suffix += ` ⏳${mLoading}`;
      if (mPending > 0) suffix += ` ⏸️${mPending}`;

      LOGGER.info(
        `     Matchup ${String(row.matchupId).padStart(3)}: [${mBar}] ${mPct.padStart(3)}% (${mCompleted}/${mTotal})${suffix}`,
      );
    }
    LOGGER.info('');

    // ── Failed player details ─────────────────────────────────────────
    if (totals.failed > 0) {
      const failedPlayers = (await db
        .select({
          mpgId: PublicSchema.matchupPlayerGames.id,
          brefId: PublicSchema.players.brefId,
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
          gameNum: PublicSchema.matchupPlayerGames.gameNum,
          gameIdentifier: PublicSchema.matchupPlayerGames.gameIdentifier,
          status: PublicSchema.matchupPlayerGames.statsLoadingStatus,
          fieldingPos: PublicSchema.matchupPlayerGames.fieldingGamePos,
        })
        .from(PublicSchema.matchupPlayerGames)
        .innerJoin(
          PublicSchema.matchupPlayers,
          eq(
            PublicSchema.matchupPlayerGames.matchupPlayerId,
            PublicSchema.matchupPlayers.id,
          ),
        )
        .innerJoin(
          PublicSchema.matchups,
          eq(PublicSchema.matchupPlayers.matchupId, PublicSchema.matchups.id),
        )
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.matchupPlayers.playerId, PublicSchema.players.id),
        )
        .where(eq(PublicSchema.matchupPlayerGames.statsLoadingStatus, 'failed'))
        .orderBy(PublicSchema.players.lastName)
        .limit(25)) as PlayerDetail[];

      LOGGER.info(
        '───────────────────────────────────────────────────────────────',
      );
      LOGGER.info(`  ❌ Failed Players (showing up to 25 of ${totals.failed})`);
      LOGGER.info(
        '───────────────────────────────────────────────────────────────',
      );

      for (const p of failedPlayers) {
        const pos = p.fieldingPos ? ` [${p.fieldingPos.trim()}]` : '';
        const gi = p.gameIdentifier ? ` → ${p.gameIdentifier}` : '';
        LOGGER.info(
          `    ${p.lastName}, ${p.firstName} (${p.brefId}) game ${p.gameNum}${pos}${gi}`,
        );
      }

      LOGGER.info('');
      LOGGER.info(
        '  💡 Retry with: .\\ls-cli.ps1 retry-failed-players [--league <id>]',
      );
      LOGGER.info('');
    }

    LOGGER.info(
      '═══════════════════════════════════════════════════════════════',
    );
  });
}

export async function handleStatsLoadingStatus(
  args: StatsLoadingStatusArgs,
): Promise<void> {
  const interval = args.interval ?? 15;

  if (args.watch) {
    LOGGER.info(`Starting watch mode (refresh every ${interval}s)...`);
    LOGGER.info('Press Ctrl+C to exit\n');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Clear console
      if (process.platform === 'win32') {
        process.stdout.write('\x1Bc');
      } else {
        process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
      }

      await displayStatus(args);

      const now = new Date().toLocaleTimeString();
      LOGGER.info(`  Last updated: ${now} — refreshing in ${interval}s...`);

      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    }
  } else {
    await displayStatus(args);
  }
}
