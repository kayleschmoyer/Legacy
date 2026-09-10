import { downloadCsvFile } from './draftPacketDownload';

// jsdom does not implement the object-URL APIs — install spies for the test,
// mirroring the pattern used in leagueSettingsExport.spec.ts (LS-9146).
describe('downloadCsvFile', () => {
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

    downloadCsvFile('draft-packet.csv', 'Round,Pick\n1,1');

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

    expect(() =>
      downloadCsvFile('draft-packet.csv', 'Round,Pick\n1,1'),
    ).toThrow('blocked');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');

    clickSpy.mockRestore();
  });
});
