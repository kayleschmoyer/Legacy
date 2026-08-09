/**
 * PickSplashStatGraphic (LS-9095) — animated notable-play stat graphic for
 * the spectator pick splash.
 *
 * Under test:
 *  - null play renders nothing
 *  - batter play renders trajectory SVG + exit velo / launch / distance chips
 *  - pitcher play renders the strikeout burst with pitch speed + type
 *  - plays without Statcast metrics fall back to the text description
 *  - Film Room affordance is a plain link-out (new tab, no embed) and is
 *    absent when no URL resolved
 */
import React from 'react';
import { screen } from '@testing-library/react';
import { PickSplashStatGraphic } from './PickSplashStatGraphic';
import type { NotablePlaySummary } from './types';
import { render } from '../../test-utils';

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

describe('PickSplashStatGraphic', () => {
  it('renders nothing without a play', () => {
    const { container } = render(<PickSplashStatGraphic play={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the batter trajectory graphic with stat chips', () => {
    render(<PickSplashStatGraphic play={makePlay()} />);

    expect(screen.getByText('HOME RUN')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Aaron Judge homers/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('112.4 MPH')).toBeInTheDocument();
    expect(screen.getByText('EXIT VELO')).toBeInTheDocument();
    expect(screen.getByText('28°')).toBeInTheDocument();
    expect(screen.getByText('441 FT')).toBeInTheDocument();
  });

  it('renders the pitcher strikeout burst with pitch speed and type', () => {
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

  it('renders the Film Room affordance as a user-initiated link-out only', () => {
    render(<PickSplashStatGraphic play={makePlay()} />);

    const link = screen.getByRole('link', { name: /Watch on MLB Film Room/ });
    expect(link).toHaveAttribute(
      'href',
      'https://www.mlb.com/video/search?q=playid=%22abc-123%22',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('omits the Film Room affordance when no share URL resolved', () => {
    render(<PickSplashStatGraphic play={makePlay({ filmRoomUrl: null })} />);
    expect(
      screen.queryByRole('link', { name: /Watch on MLB Film Room/ }),
    ).not.toBeInTheDocument();
  });
});
