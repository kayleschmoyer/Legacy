import { DbOptions } from '@legacy-sports/utils';
import { runWithPublicClient } from '../client/Helpers';
import {
  getActiveScoringProfileForLeague,
  getScoringMultipliersForLeague,
  getScoringProfileEntriesForProfile,
  getScoringStatDefinitions,
  type LeagueScoringMultiplierUpdateInput,
  updateLeagueScoringProfileEntries,
} from '../client/PublicDbClient';
import {
  LeagueScoringProfileEntry,
  ScoringStatDefinition,
} from '../../types/DatabaseTypes';
import {
  LeagueScoringMultipliers,
  LeagueScoringProfileSummary,
} from '../../types/ScoringTypes';

export type LeagueScoringMultiplierUpdate = LeagueScoringMultiplierUpdateInput;
export interface LeagueScoringProfileDetails
  extends LeagueScoringProfileSummary {
  entries: LeagueScoringProfileEntry[];
  definitions: ScoringStatDefinition[];
}

export class ScoringService {
  constructor(private readonly options: DbOptions) {}

  async getScoringMultipliers(
    leagueId?: number | null,
  ): Promise<LeagueScoringMultipliers> {
    return runWithPublicClient(this.options, (db) =>
      getScoringMultipliersForLeague(db, leagueId),
    );
  }

  async getDefaultMultipliers(): Promise<LeagueScoringMultipliers> {
    return this.getScoringMultipliers(null);
  }

  async getScoringDefinitions(): Promise<ScoringStatDefinition[]> {
    return runWithPublicClient(this.options, (db) =>
      getScoringStatDefinitions(db),
    );
  }

  async getActiveProfileSummary(
    leagueId: number,
  ): Promise<LeagueScoringProfileSummary> {
    return runWithPublicClient(this.options, async (db) => {
      const profile = await getActiveScoringProfileForLeague(db, leagueId);

      if (!profile) {
        return {
          profileId: null,
          leagueId,
          profileName: null,
        };
      }

      return {
        profileId: profile.id,
        leagueId: profile.leagueId,
        profileName: profile.profileName,
      };
    });
  }

  async getActiveProfileDetails(
    leagueId: number,
  ): Promise<LeagueScoringProfileDetails> {
    return runWithPublicClient(this.options, async (db) => {
      const profile = await getActiveScoringProfileForLeague(db, leagueId);
      const definitions = await getScoringStatDefinitions(db);

      if (!profile) {
        return {
          profileId: null,
          leagueId,
          profileName: null,
          entries: [],
          definitions,
        };
      }

      const entries = await getScoringProfileEntriesForProfile(db, profile.id);

      return {
        profileId: profile.id,
        leagueId: profile.leagueId,
        profileName: profile.profileName,
        entries,
        definitions,
      };
    });
  }

  async updateActiveProfile(
    leagueId: number,
    updates: LeagueScoringMultiplierUpdate[],
  ): Promise<LeagueScoringProfileDetails> {
    if (!Number.isFinite(leagueId)) {
      throw new Error('A valid leagueId is required');
    }

    if (!updates || updates.length === 0) {
      return this.getActiveProfileDetails(leagueId);
    }

    return runWithPublicClient(this.options, async (db) => {
      const profile = await getActiveScoringProfileForLeague(db, leagueId);

      if (!profile) {
        throw new Error(
          `Active scoring profile not found for league ${leagueId}`,
        );
      }

      const entries = await updateLeagueScoringProfileEntries(
        db,
        profile.id,
        updates,
      );
      const definitions = await getScoringStatDefinitions(db);

      return {
        profileId: profile.id,
        leagueId: profile.leagueId,
        profileName: profile.profileName,
        entries,
        definitions,
      } satisfies LeagueScoringProfileDetails;
    });
  }
}

export function createScoringService(options: DbOptions): ScoringService {
  return new ScoringService(options);
}
