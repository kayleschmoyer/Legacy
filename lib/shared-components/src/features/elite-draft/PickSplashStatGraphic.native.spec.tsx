/**
 * PickSplashStatGraphic (native, LS-9112) — notable-play stat graphic for the
 * native spectator pick splash.
 *
 * Under test:
 *  - null play renders nothing (graceful degradation, AC3)
 *  - batter play renders event label + exit velo / launch / distance chips
 *  - pitcher play renders the K mark with pitch speed + type
 *  - plays without Statcast metrics fall back to the text description
 *  - Film Room affordance is a user-initiated Linking.openURL link-out only
 *    (no embed) and is absent when no URL resolved
 *
 * The setup-level react-native mock differs per jest project (the web one has
 * no Animated/Easing/Linking), so this spec ships its own minimal mock — the
 * component's Animated usage is presentation-only and not under test.
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { PickSplashStatGraphic } from './PickSplashStatGraphic.native';
import type { NotablePlaySummary } from './types';
import { render } from '../../test-utils';

jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(() => ({
      setValue: jest.fn(),
      interpolate: jest.fn(() => undefined),
    })),
    timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    View: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
  },
  Easing: {
    out: jest.fn((easing: unknown) => easing),
    in: jest.fn((easing: unknown) => easing),
    cubic: jest.fn(),
    quad: jest.fn(),
  },
  Linking: {
    openURL: jest.fn(() => Promise.resolve()),
  },
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    accessibilityRole,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: string;
  }) => (
    <button
      onClick={onPress}
      data-accessibility-label={accessibilityLabel}
      data-accessibility-role={accessibilityRole}
    >
      {children}
    </button>
  ),
}));

let openUrlSpy: jest.SpiedFunction<typeof Linking.openURL>;

function makePlay(
  overrides: Partial<NotablePlaySummary> = {},
): NotablePlaySummary {
  return {
    mlbPlayerId: 592450,
    playerRole: 'batter',
    gameDate: '2026-08-05',
    eventType: 'home_run',
    description: 'Aaron Judge homers (40) on a fly ball.',
    exitVelocity: 112.4,
    launchAngle: 28,
    hitDistance: 441,
    pitchSpeed: null,
    pitchType: null,
    filmRoomUrl: 'https://www.mlb.com/video/search?q=playid=%22abc-123%22',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  openUrlSpy = jest.spyOn(Linking, 'openURL');
});

describe('PickSplashStatGraphic (native)', () => {
  it('renders nothing without a play', () => {
    const { container } = render(<PickSplashStatGraphic play={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the batter event label with stat chips', () => {
    render(<PickSplashStatGraphic play={makePlay()} />);

    expect(screen.getByText('HOME RUN')).toBeInTheDocument();
    expect(screen.getByText('112.4 MPH')).toBeInTheDocument();
    expect(screen.getByText('EXIT VELO')).toBeInTheDocument();
    expect(screen.getByText('28°')).toBeInTheDocument();
    expect(screen.getByText('441 FT')).toBeInTheDocument();
  });

  it('renders the pitcher K mark with pitch speed and type', () => {
    render(
      <PickSplashStatGraphic
        play={makePlay({
          playerRole: 'pitcher',
          eventType: 'strikeout',
          description: 'Gerrit Cole strikes out the side.',
          exitVelocity: null,
          launchAngle: null,
          hitDistance: null,
          pitchSpeed: 99.1,
          pitchType: 'Slider',
        })}
      />,
    );

    expect(screen.getByText('STRIKEOUT')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.getByText('99.1 MPH')).toBeInTheDocument();
    expect(screen.getByText('SLIDER')).toBeInTheDocument();
  });

  it('falls back to the description when the play has no Statcast metrics', () => {
    render(
      <PickSplashStatGraphic
        play={makePlay({
          eventType: 'double',
          exitVelocity: null,
          launchAngle: null,
          hitDistance: null,
          description: 'Doubles on a sharp line drive.',
        })}
      />,
    );

    expect(
      screen.getByText('Doubles on a sharp line drive.'),
    ).toBeInTheDocument();
  });

  it('opens the Film Room URL via Linking on a user press — link-out only', () => {
    const { container } = render(<PickSplashStatGraphic play={makePlay()} />);

    const link = container.querySelector(
      '[data-accessibility-label="Watch on MLB Film Room"]',
    );
    expect(link).toBeTruthy();
    fireEvent.click(link as Element);
    expect(openUrlSpy).toHaveBeenCalledWith(
      'https://www.mlb.com/video/search?q=playid=%22abc-123%22',
    );
  });

  it.each([
    'javascript:alert(1)',
    'https://evil.example.com/www.mlb.com/video/x',
    'http://www.mlb.com/video/insecure',
  ])(
    'refuses the Film Room affordance for untrusted URL %s',
    (untrustedUrl) => {
      const { container } = render(
        <PickSplashStatGraphic
          play={makePlay({ filmRoomUrl: untrustedUrl })}
        />,
      );
      expect(
        container.querySelector(
          '[data-accessibility-label="Watch on MLB Film Room"]',
        ),
      ).toBeNull();
      expect(openUrlSpy).not.toHaveBeenCalled();
    },
  );

  it('omits the Film Room affordance when no share URL resolved', () => {
    const { container } = render(
      <PickSplashStatGraphic play={makePlay({ filmRoomUrl: null })} />,
    );
    expect(
      container.querySelector(
        '[data-accessibility-label="Watch on MLB Film Room"]',
      ),
    ).toBeNull();
  });
});
