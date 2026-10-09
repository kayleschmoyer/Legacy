import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FootballPlayerDetailModal } from './FootballPlayerDetailModal';

jest.mock('tamagui', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Button: ({
      children,
      onPress,
      'aria-label': ariaLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      'aria-label'?: string;
    }) => (
      <button type="button" aria-label={ariaLabel} onClick={onPress}>
        {children}
      </button>
    ),
    ScrollView: Pass,
    XStack: Pass,
  };
});

jest.mock('@tamagui/lucide-icons/icons/ExternalLink', () => ({
  ExternalLink: () => null,
}));
jest.mock('@tamagui/lucide-icons/icons/X', () => ({ X: () => null }));

jest.mock('@legacy-sports/shared-components/football', () => ({
  FootballPlayerDetail: () => <div data-testid="football-player-detail" />,
}));
jest.mock('@legacy-sports/app-config/web', () => ({
  config: { statsApiUrl: undefined },
}));
jest.mock('@legacy-sports/utils', () => ({
  ENTITLEMENTS: { football_projections: 'football_projections' },
}));
jest.mock('@legacy-sports/graphql', () => ({
  useFootballPlayerQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
  }),
}));
jest.mock('../hooks/useIsPremium', () => ({ useHasEntitlement: () => true }));
jest.mock('./UpgradeModal', () => ({ UpgradeModal: () => null }));
jest.mock('./BaseModal', () => ({
  BaseModal: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="base-modal">{children}</div>
  ),
}));
jest.mock('../constants/colors', () => ({
  BG_DARK: '#000',
  OUTLINE_SUBTLE: '#outline',
  STATS_BORDER: '#border',
  TEXT_INTERFACE: '#text',
  TEXT_MUTED: '#muted',
  WHITE: '#fff',
  withAlpha: (color: string) => color,
}));

describe('FootballPlayerDetailModal', () => {
  it('renders a labelled Close button that dismisses the modal', () => {
    const onOpenChange = jest.fn();
    render(
      <FootballPlayerDetailModal
        playerId={1}
        open
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders Full page as a real button when onViewFullPage is provided', () => {
    const onViewFullPage = jest.fn();
    render(
      <FootballPlayerDetailModal
        playerId={1}
        open
        onOpenChange={jest.fn()}
        onViewFullPage={onViewFullPage}
      />,
    );
    const fullPage = screen.getByRole('button', { name: 'Open full page' });
    expect(fullPage.tagName).toBe('BUTTON');
    fireEvent.click(fullPage);
    expect(onViewFullPage).toHaveBeenCalledTimes(1);
  });

  it('omits Full page when onViewFullPage is not provided', () => {
    render(
      <FootballPlayerDetailModal playerId={1} open onOpenChange={jest.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Open full page' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
