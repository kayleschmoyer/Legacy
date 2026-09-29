/**
 * LS-7097 — loadCollapsedSections falls back to all-expanded when the stored
 * JSON is corrupt, and must log a warning so the corruption is diagnosable.
 */
import { loadCollapsedSections } from './PreferencesPage';

const mockWarn = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    warn: (...args: unknown[]): void => {
      mockWarn(...args);
    },
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('@legacy-sports/shared-components/ui', () => ({}));
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: jest.fn(),
}));
jest.mock('@legacy-sports/graphql', () => ({}));
jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: jest.fn(),
}));
jest.mock('tamagui', () => ({
  ScrollView: () => null,
  Spinner: () => null,
  styled: () => () => null,
}));

const KEY = 'ls_prefs_sections_collapsed';
const ALL_EXPANDED = {
  appearance: false,
  sports: false,
  notifications: false,
};

describe('loadCollapsedSections', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('returns defaults without warning when nothing is stored', () => {
    expect(loadCollapsedSections()).toEqual(ALL_EXPANDED);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('restores stored collapsed state without warning', () => {
    localStorage.setItem(KEY, JSON.stringify({ sports: true }));
    expect(loadCollapsedSections()).toEqual({ ...ALL_EXPANDED, sports: true });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('falls back to all-expanded and logs a warning when the JSON is corrupt', () => {
    localStorage.setItem(KEY, '{not valid json');
    expect(loadCollapsedSections()).toEqual(ALL_EXPANDED);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('collapsed sections'),
      expect.any(SyntaxError),
    );
  });
});
