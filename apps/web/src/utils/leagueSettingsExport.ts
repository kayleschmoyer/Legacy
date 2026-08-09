// LS-9146: export/import a league's settings as JSON, so a commissioner can
// carry a familiar configuration (scoring, roster, waiver, salary cap, keeper
// rules, etc.) from one league into a brand-new one instead of re-entering it
// by hand. Only settings that are actually persisted on the League entity
// after creation are included — one-time draft-setup inputs (draft mode/order,
// scheduling strategy, pick timer, per-slot roster config) aren't stored on
// the league post-creation and can't be round-tripped.

export const LEAGUE_SETTINGS_EXPORT_VERSION = 1 as const;

export type ExportableSport = 'baseball' | 'football';

export interface LeagueSettingsExportPayload {
  numberOfTeams?: number;
  playerPool?: string;
  maxRosterSize?: number;
  waiverType?: string;
  faabBudgetDefault?: number;
  isPublic?: boolean;
  gamesPerMatchup?: number;
  baseballEraFilter?: string;
  baseballHofOnly?: boolean;
  customEraStartYear?: number;
  customEraEndYear?: number;
  salaryCapEnabled?: boolean;
  salaryCap?: number;
  salaryFloor?: number;
  luxuryTaxThreshold?: number;
  minSalary?: number;
  salaryEscalationPct?: number;
  salaryDecayPct?: number;
  auctionBudget?: number;
  auctionMinBid?: number;
  allowDraftSlotTrading?: boolean;
  rosterContinuity?: string;
  keeperCount?: number;
  keeperCostModel?: string;
  maxConsecutiveKeeps?: number;
  rookieExempt?: boolean;
  defensiveFormat?: string;
}

export interface LeagueSettingsExportEnvelope {
  version: typeof LEAGUE_SETTINGS_EXPORT_VERSION;
  exportedAt: string;
  sourceLeagueName: string;
  sport: ExportableSport;
  settings: LeagueSettingsExportPayload;
}

/** Source shape mirrors the `League` GraphQL fragment plus a team count. */
export interface LeagueSettingsExportSource {
  sport: ExportableSport;
  leagueName: string;
  numberOfTeams?: number | null;
  playerPool?: string | null;
  maxRosterSize?: number | null;
  waiverType?: string | null;
  faabBudgetDefault?: number | null;
  isPublic?: boolean | null;
  gamesPerMatchup?: number | null;
  eraFilter?: string | null;
  baseballHofOnly?: boolean | null;
  customEraStartYear?: number | null;
  customEraEndYear?: number | null;
  salaryCapEnabled?: boolean | null;
  salaryCap?: number | null;
  salaryFloor?: number | null;
  luxuryTaxThreshold?: number | null;
  minSalary?: number | null;
  salaryEscalationPct?: number | null;
  salaryDecayPct?: number | null;
  auctionBudget?: number | null;
  auctionMinBid?: number | null;
  allowDraftSlotTrading?: boolean | null;
  rosterContinuity?: string | null;
  keeperCount?: number | null;
  keeperCostModel?: string | null;
  maxConsecutiveKeeps?: number | null;
  rookieExempt?: boolean | null;
  defensiveFormat?: string | null;
}

function omitNullish<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

export function buildLeagueSettingsExport(
  source: LeagueSettingsExportSource,
  now: Date,
): LeagueSettingsExportEnvelope {
  const settings = omitNullish<LeagueSettingsExportPayload>({
    numberOfTeams: source.numberOfTeams ?? undefined,
    playerPool: source.playerPool ?? undefined,
    maxRosterSize: source.maxRosterSize ?? undefined,
    waiverType: source.waiverType ?? undefined,
    faabBudgetDefault: source.faabBudgetDefault ?? undefined,
    isPublic: source.isPublic ?? undefined,
    gamesPerMatchup: source.gamesPerMatchup ?? undefined,
    baseballEraFilter: source.eraFilter ?? undefined,
    baseballHofOnly: source.baseballHofOnly ?? undefined,
    customEraStartYear: source.customEraStartYear ?? undefined,
    customEraEndYear: source.customEraEndYear ?? undefined,
    salaryCapEnabled: source.salaryCapEnabled ?? undefined,
    salaryCap: source.salaryCap ?? undefined,
    salaryFloor: source.salaryFloor ?? undefined,
    luxuryTaxThreshold: source.luxuryTaxThreshold ?? undefined,
    minSalary: source.minSalary ?? undefined,
    salaryEscalationPct: source.salaryEscalationPct ?? undefined,
    salaryDecayPct: source.salaryDecayPct ?? undefined,
    auctionBudget: source.auctionBudget ?? undefined,
    auctionMinBid: source.auctionMinBid ?? undefined,
    allowDraftSlotTrading: source.allowDraftSlotTrading ?? undefined,
    rosterContinuity: source.rosterContinuity ?? undefined,
    keeperCount: source.keeperCount ?? undefined,
    keeperCostModel: source.keeperCostModel ?? undefined,
    maxConsecutiveKeeps: source.maxConsecutiveKeeps ?? undefined,
    rookieExempt: source.rookieExempt ?? undefined,
    defensiveFormat: source.defensiveFormat ?? undefined,
  });

  return {
    version: LEAGUE_SETTINGS_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    sourceLeagueName: source.leagueName,
    sport: source.sport,
    settings,
  };
}

export function serializeLeagueSettingsExport(
  envelope: LeagueSettingsExportEnvelope,
): string {
  return JSON.stringify(envelope, null, 2);
}

export function sanitizeFilenameSegment(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-');
}

/** Triggers a browser download of `contents` as a file named `filename`. */
export function downloadJsonFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export type ParseLeagueSettingsExportResult =
  | { ok: true; envelope: LeagueSettingsExportEnvelope }
  | { ok: false; error: string };

/**
 * Validates that `text` parses as JSON and has the shape of a league settings
 * export envelope. Field-level validation/clamping against the create-league
 * form's own option sets happens at the call site (LeagueCreatePage), which
 * already owns those constants.
 */
export function parseLeagueSettingsExport(
  text: string,
): ParseLeagueSettingsExportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That doesn’t look like valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Expected a JSON object.' };
  }

  const candidate = parsed as Record<string, unknown>;
  const { sport, settings } = candidate;

  if (sport !== 'baseball' && sport !== 'football') {
    return {
      ok: false,
      error:
        'Missing or unrecognized "sport" — is this a league settings export file?',
    };
  }
  if (typeof settings !== 'object' || settings === null) {
    return {
      ok: false,
      error: 'Missing "settings" — is this a league settings export file?',
    };
  }

  return {
    ok: true,
    envelope: {
      version: LEAGUE_SETTINGS_EXPORT_VERSION,
      exportedAt:
        typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
      sourceLeagueName:
        typeof candidate.sourceLeagueName === 'string'
          ? candidate.sourceLeagueName
          : '',
      sport,
      settings: settings,
    },
  };
}
