import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useTeamBranding } from '@legacy-sports/shared-components/roster';

import { TeamTab } from './Team';

// ColorInputGroup is not exported — test it via TeamTab's rendered output.
// We isolate the branding section by mocking the heavy deps.

jest.mock('@legacy-sports/graphql', () => ({
  useGetTeamMembersQuery: () => ({ data: undefined }),
  RosterContinuity: {
    Dynasty: 'dynasty',
    Keeper: 'keeper',
    Redraft: 'redraft',
  },
}));

jest.mock('@legacy-sports/shared-components/roster', () => ({
  useTeamBranding: jest.fn(),
}));

jest.mock('../../../../hooks/useIsPremium', () => ({
  useHasEntitlement: () => false,
}));

jest.mock('../../../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseTeamBranding = jest.mocked(useTeamBranding);

const mockSetPrimary = jest.fn();
const mockSetSecondary = jest.fn();
const PRESET_COLORS = ['#ff0000', '#00ff00', '#0000ff'];

const makeBranding = (primaryColor = '#ff0000') => ({
  name: 'Test Team',
  setName: jest.fn(),
  primaryColor,
  setPrimaryColor: mockSetPrimary,
  secondaryColor: '#0000ff',
  setSecondaryColor: mockSetSecondary,
  logoUrl: '',
  setLogoUrl: jest.fn(),
  currentTeamName: 'Test Team',
  trimmedName: 'Test Team',
  nameDirty: false,
  renaming: false,
  savingBranding: false,
  savedFlash: null,
  presetColors: PRESET_COLORS,
  saveName: jest.fn(),
  saveBranding: jest.fn(),
});

const LEAGUE = { id: 1, sport: 'baseball' } as never;
const TEAM = { id: 10, name: 'Test Team' } as never;

describe('ColorInputGroup (via TeamTab)', () => {
  beforeEach(() => {
    mockSetPrimary.mockClear();
    mockSetSecondary.mockClear();
    mockUseTeamBranding.mockReturnValue(makeBranding());
  });

  it('renders hex text inputs for both primary and secondary color', () => {
    render(<TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />);
    expect(screen.getByLabelText('Primary Color hex')).toBeInTheDocument();
    expect(screen.getByLabelText('Secondary Color hex')).toBeInTheDocument();
  });

  it('renders native color pickers for both colors', () => {
    render(<TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />);
    expect(
      screen.getByLabelText('Primary Color color picker'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Secondary Color color picker'),
    ).toBeInTheDocument();
  });

  it('calls setPrimaryColor when a valid 6-digit hex is typed', () => {
    render(<TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />);
    const input = screen.getByLabelText('Primary Color hex');
    fireEvent.change(input, { target: { value: '#c41e3a' } });
    expect(mockSetPrimary).toHaveBeenCalledWith('#c41e3a');
  });

  it('does NOT call setPrimaryColor for partial hex input', () => {
    render(<TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />);
    const input = screen.getByLabelText('Primary Color hex');
    fireEvent.change(input, { target: { value: '#c41' } });
    expect(mockSetPrimary).not.toHaveBeenCalled();
  });

  it('prepends # if missing when typing hex without it', () => {
    render(<TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />);
    const input = screen.getByLabelText('Primary Color hex');
    fireEvent.change(input, { target: { value: 'c41e3a' } });
    expect(mockSetPrimary).toHaveBeenCalledWith('#c41e3a');
  });

  it('calls setSecondaryColor when native color picker changes', () => {
    render(<TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />);
    const picker = screen.getByLabelText('Secondary Color color picker');
    fireEvent.change(picker, { target: { value: '#123456' } });
    expect(mockSetSecondary).toHaveBeenCalledWith('#123456');
  });

  it('calls setPrimaryColor when a preset swatch is clicked', () => {
    render(<TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />);
    const swatch = screen.getByLabelText('Pick primary color #00ff00');
    fireEvent.click(swatch);
    expect(mockSetPrimary).toHaveBeenCalledWith('#00ff00');
  });

  it('hex text input syncs when value prop changes externally', () => {
    const { rerender } = render(
      <TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />,
    );
    const input = screen.getByLabelText('Primary Color hex');
    expect(input).toHaveValue('#ff0000');

    mockUseTeamBranding.mockReturnValue(makeBranding('#abcdef'));
    rerender(<TeamTab league={LEAGUE} myTeamId={10} myTeam={TEAM} />);
    expect(input).toHaveValue('#abcdef');
  });
});
