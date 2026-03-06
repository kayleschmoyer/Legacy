import type { DbOptions } from '@legacy-sports/utils/node';
import type { LeagueScoringMultiplierUpdate } from './ScoringService';
import { ScoringService } from './ScoringService';
import type {
  LeagueScoringProfile,
  LeagueScoringProfileEntry,
  ScoringStatDefinition,
} from '../../types/DatabaseTypes';

jest.mock('../client/Helpers', () => ({
  runWithPublicClient: jest.fn(),
}));

jest.mock('../client/PublicDbClient', () => ({
  getActiveScoringProfileForLeague: jest.fn(),
  getScoringMultipliersForLeague: jest.fn(),
  getScoringProfileEntriesForProfile: jest.fn(),
  getScoringStatDefinitions: jest.fn(),
  updateLeagueScoringProfileEntries: jest.fn(),
}));

const mockedHelpers = jest.mocked<typeof import('../client/Helpers')>(
  jest.requireMock('../client/Helpers'),
);

const publicClientMocks = jest.mocked<
  typeof import('../client/PublicDbClient')
>(jest.requireMock('../client/PublicDbClient'));

describe('ScoringService', () => {
  const options = { type: 'pg-local' } as DbOptions;
  let service: ScoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScoringService(options);

    mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
      handler({} as never),
    );
  });

  describe('updateActiveProfile', () => {
    const leagueId = 42;
    const profile: LeagueScoringProfile = {
      id: 7,
      leagueId,
      profileName: 'Custom',
      seasonYear: 2024,
      status: 'active',
      isDefault: true,
      copiedFromProfileId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
    };

    const definitions: ScoringStatDefinition[] = [
      {
        id: 100,
        statKey: 'batting_hr',
        statGroup: 'batting',
        sourceTable: 'season_batting',
        sourceColumn: 'hr',
        displayName: 'Home Runs',
        description: null,
        defaultMultiplier: '4',
        minMultiplier: '0',
        maxMultiplier: '15',
        stepSize: '0.5',
        isRequired: true,
        enforcePositive: true,
        enforceNegative: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const entries: LeagueScoringProfileEntry[] = [
      {
        id: 501,
        profileId: profile.id,
        statDefinitionId: definitions[0].id,
        multiplier: '5',
        isEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    beforeEach(() => {
      publicClientMocks.getActiveScoringProfileForLeague.mockResolvedValue(
        profile,
      );
      publicClientMocks.getScoringStatDefinitions.mockResolvedValue(
        definitions,
      );
      publicClientMocks.updateLeagueScoringProfileEntries.mockResolvedValue(
        entries,
      );
    });

    it('throws when no active profile exists', async () => {
      publicClientMocks.getActiveScoringProfileForLeague.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.updateActiveProfile(leagueId, [
          {
            statDefinitionId: definitions[0].id,
            multiplier: 4,
          },
        ]),
      ).rejects.toThrow('Active scoring profile not found for league 42');

      expect(
        publicClientMocks.updateLeagueScoringProfileEntries,
      ).not.toHaveBeenCalled();
    });

    it('updates multipliers and returns refreshed profile details', async () => {
      const updates: LeagueScoringMultiplierUpdate[] = [
        {
          statDefinitionId: definitions[0].id,
          multiplier: 5,
        },
      ];

      const result = await service.updateActiveProfile(leagueId, updates);

      expect(
        publicClientMocks.updateLeagueScoringProfileEntries,
      ).toHaveBeenCalledTimes(1);

      const [, profileIdArg, updatesArg] =
        publicClientMocks.updateLeagueScoringProfileEntries.mock.calls[0];

      expect(profileIdArg).toBe(profile.id);
      expect(updatesArg).toEqual([
        {
          statDefinitionId: definitions[0].id,
          multiplier: 5,
          isEnabled: undefined,
        },
      ]);
      expect(publicClientMocks.getScoringStatDefinitions).toHaveBeenCalled();
      expect(result).toEqual({
        profileId: profile.id,
        leagueId: profile.leagueId,
        profileName: profile.profileName,
        entries,
        definitions,
      });
    });

    it('returns current profile when no updates provided', async () => {
      const expected = {
        profileId: profile.id,
        leagueId: profile.leagueId,
        profileName: profile.profileName,
        entries,
        definitions,
      };

      const getDetailsSpy = jest
        .spyOn(service, 'getActiveProfileDetails')
        .mockResolvedValue(expected);

      const result = await service.updateActiveProfile(leagueId, []);

      expect(getDetailsSpy).toHaveBeenCalledWith(leagueId);
      expect(result).toBe(expected);
    });
  });
});
