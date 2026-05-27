import { LOGGER } from '@legacy-sports/logging';

import {
  isBaseballScoringGroup,
  isScoringGroup,
  resolveScoringStatGroup,
} from './scoring';

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

describe('isScoringGroup', () => {
  it.each([
    'batting',
    'pitching',
    'fielding',
    'passing',
    'rushing',
    'receiving',
    'kicking',
    'defense',
    'idp',
  ] as const)('returns true for known group %s', (group) => {
    expect(isScoringGroup(group)).toBe(true);
  });
});

describe('resolveScoringStatGroup', () => {
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(LOGGER, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it.each([
    'batting',
    'pitching',
    'fielding',
    'passing',
    'rushing',
    'receiving',
    'kicking',
    'defense',
    'idp',
  ] as const)('returns %s unchanged for all known groups', (group) => {
    expect(resolveScoringStatGroup({ id: 1, statGroup: group })).toBe(group);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });
});
