import {
  buildLeagueSettingsExport,
  downloadJsonFile,
  LEAGUE_SETTINGS_EXPORT_VERSION,
  sanitizeFilenameSegment,
  serializeLeagueSettingsExport,
} from './leagueSettingsExport';

describe('buildLeagueSettingsExport', () => {
  it('builds an envelope with only the fields that are set', () => {
    const envelope = buildLeagueSettingsExport(
      {
        sport: 'baseball',
        leagueName: 'The Sluggers',
        numberOfTeams: 12,
        waiverType: 'faab',
        faabBudgetDefault: 100,
      },
      new Date('2026-01-01T00:00:00.000Z'),
    );

    expect(envelope.version).toBe(LEAGUE_SETTINGS_EXPORT_VERSION);
    expect(envelope.exportedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(envelope.sourceLeagueName).toBe('The Sluggers');
    expect(envelope.sport).toBe('baseball');
    expect(envelope.settings).toEqual({
      numberOfTeams: 12,
      waiverType: 'faab',
      faabBudgetDefault: 100,
    });
  });

  it('omits null and undefined fields rather than including them as null', () => {
    const envelope = buildLeagueSettingsExport(
      {
        sport: 'football',
        leagueName: 'Gridiron League',
        maxRosterSize: null,
        salaryCap: undefined,
        isPublic: false,
      },
      new Date('2026-01-01T00:00:00.000Z'),
    );

    expect(envelope.settings).toEqual({ isPublic: false });
    expect('maxRosterSize' in envelope.settings).toBe(false);
    expect('salaryCap' in envelope.settings).toBe(false);
  });
});

describe('serializeLeagueSettingsExport', () => {
  it('round-trips through JSON.parse', () => {
    const envelope = buildLeagueSettingsExport(
      { sport: 'baseball', leagueName: 'Test League', numberOfTeams: 10 },
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const json = serializeLeagueSettingsExport(envelope);
    expect(JSON.parse(json)).toEqual(envelope);
  });
});

describe('sanitizeFilenameSegment', () => {
  it('replaces non-alphanumeric characters with a single hyphen', () => {
    expect(sanitizeFilenameSegment('The Sluggers!! 2026')).toBe(
      'The-Sluggers-2026',
    );
  });

  it('collapses repeated separators', () => {
    expect(sanitizeFilenameSegment('a---b   c')).toBe('a-b-c');
  });

  it('leaves an already-safe name untouched', () => {
    expect(sanitizeFilenameSegment('my-league-2026')).toBe('my-league-2026');
  });
});

// jsdom does not implement the object-URL APIs — install spies for the test,
// mirroring the pattern used for the players export (LS-7660 / GAP-002).
describe('downloadJsonFile', () => {
  const createObjectURL = jest.fn<string, [Blob]>();
  const revokeObjectURL = jest.fn<void, [string]>();

  beforeEach(() => {
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    createObjectURL.mockImplementation(() => 'blob:mock-1');
    (
      URL as unknown as { createObjectURL: typeof createObjectURL }
    ).createObjectURL = createObjectURL;
    (
      URL as unknown as { revokeObjectURL: typeof revokeObjectURL }
    ).revokeObjectURL = revokeObjectURL;
  });

  it('creates and revokes an object URL around a programmatic download click', () => {
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadJsonFile('my-league-settings.json', '{"sport":"baseball"}');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
    expect(document.querySelector('a[download]')).toBeNull();

    clickSpy.mockRestore();
  });

  it('still revokes the object URL when the link click throws', () => {
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {
        throw new Error('blocked');
      });

    expect(() => downloadJsonFile('my-league-settings.json', '{}')).toThrow(
      'blocked',
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');

    clickSpy.mockRestore();
  });
});
