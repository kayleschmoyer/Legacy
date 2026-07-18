import axios from 'axios';
import { getPlayerGameLog, getPlayerPage } from './PFRSession';

// Spy on axios.get only — do NOT jest.mock('axios') as that auto-mocks
// isAxiosError to return undefined, which breaks the retry-logic branch.
const mockAxiosGet = jest.spyOn(axios, 'get');

// VALID_PFR_ID guards getPlayerPage/getPlayerGameLog path segments against
// traversal (LS-8416). Widening the character class to allow "." must keep
// rejecting anything that could escape the /players/<letter>/<id>... path.
describe('VALID_PFR_ID path-segment validation', () => {
  beforeEach(() => {
    mockAxiosGet.mockResolvedValue({ data: '<html></html>' });
  });

  it('accepts a dotted pfrId (A.J./C.J.-style names)', async () => {
    await expect(getPlayerPage('BrowC.20')).resolves.toBe('<html></html>');
    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://www.pro-football-reference.com/players/B/BrowC.20.htm',
      expect.anything(),
    );
  });

  it('accepts a dotted pfrId in getPlayerGameLog', async () => {
    await expect(getPlayerGameLog('BrowC.20', 2020)).resolves.toBe(
      '<html></html>',
    );
    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://www.pro-football-reference.com/players/B/BrowC.20/gamelog/2020/',
      expect.anything(),
    );
  });

  it('rejects a lone ".." traversal attempt', () => {
    expect(() => getPlayerPage('..')).toThrow('Invalid pfrId: ".."');
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('rejects a lone "." segment', () => {
    expect(() => getPlayerPage('.')).toThrow('Invalid pfrId: "."');
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('rejects ".." in getPlayerGameLog, where pfrId sits between literal slashes', () => {
    expect(() => getPlayerGameLog('..', 2020)).toThrow('Invalid pfrId: ".."');
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('rejects ".." embedded with a path separator', () => {
    expect(() => getPlayerPage('../../etc/passwd')).toThrow(/Invalid pfrId/);
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('rejects a pfrId containing a slash', () => {
    expect(() => getPlayerPage('Brow/C20')).toThrow(/Invalid pfrId/);
  });

  it('rejects a pfrId longer than 20 characters', () => {
    expect(() => getPlayerPage('A'.repeat(21))).toThrow(/Invalid pfrId/);
  });

  it('rejects an empty pfrId', () => {
    expect(() => getPlayerPage('')).toThrow(/Invalid pfrId/);
  });
});
