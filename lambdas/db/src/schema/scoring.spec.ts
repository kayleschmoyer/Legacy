import { LOGGER } from '@legacy-sports/logging';

import { isBaseballScoringGroup, resolveBaseballScoringGroup } from './scoring';

describe('isBaseballScoringGroup', () => {
  it.each(['batting', 'pitching', 'fielding'] as const)(
    'returns true for baseball group %s',
    (group) => {
      expect(isBaseballScoringGroup(group)).toBe(true);
    },
  );

  it.each([
    'passing',
    'rushing',
    'receiving',
    'kicking',
    'defense',
    'idp',
  ] as const)('returns false for football group %s', (group) => {
    expect(isBaseballScoringGroup(group)).toBe(false);
  });
});

describe('resolveBaseballScoringGroup', () => {
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(LOGGER, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it.each(['batting', 'pitching', 'fielding'] as const)(
    'returns %s unchanged for baseball groups',
    (group) => {
      expect(resolveBaseballScoringGroup({ id: 1, statGroup: group })).toBe(
        group,
      );
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    'passing',
    'rushing',
    'receiving',
    'kicking',
    'defense',
    'idp',
  ] as const)('throws and logs for football group %s', (group) => {
    expect(() =>
      resolveBaseballScoringGroup({ id: 42, statGroup: group }),
    ).toThrow(`Unexpected non-baseball scoring stat group: ${group}`);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      `Unexpected non-baseball scoring stat group: ${group}`,
      expect.any(Error),
      { statGroup: group, statDefinitionId: 42 },
    );
  });
});
