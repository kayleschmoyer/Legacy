import React from 'react';
import { fireEvent } from '@testing-library/react';
import { DraftHero, LEAVES_DRAFT_ATTRIBUTE } from './DraftHero';
import { render, screen } from '../../test-utils';

const baseProps = {
  leagueName: 'Dead Ball Dynasty',
  backHref: '/baseball/league/7',
  onNavigate: jest.fn(),
  draftPaused: false,
  round: 4,
  overallPick: 42,
  totalPicks: 276,
  teamCount: 12,
  selectionMethod: 'standard',
  draftOrder: 'snake',
  compact: false,
};

describe('DraftHero', () => {
  it('renders the title and the live / pick / format badges', () => {
    render(<DraftHero {...baseProps} />);

    expect(screen.getByText('Dead Ball Dynasty · Draft')).toBeTruthy();
    expect(screen.getByText('Draft Live')).toBeTruthy();
    expect(screen.getByText('Round 4 · Pick 42 of 276')).toBeTruthy();
    expect(screen.getByText('12 teams · Snake')).toBeTruthy();
  });

  it('labels auction drafts by their selection method', () => {
    render(<DraftHero {...baseProps} selectionMethod="auction" />);

    expect(screen.getByText('12 teams · Auction')).toBeTruthy();
  });

  it('reads Draft Paused while the commissioner has paused the draft', () => {
    render(<DraftHero {...baseProps} draftPaused />);

    expect(screen.getByText('Draft Paused')).toBeTruthy();
  });

  it('omits the total and an unknown format rather than guessing', () => {
    render(<DraftHero {...baseProps} totalPicks={null} draftOrder={null} />);

    expect(screen.getByText('Round 4 · Pick 42')).toBeTruthy();
    expect(screen.getByText('12 teams')).toBeTruthy();
  });

  it('navigates back to the league on a plain click', () => {
    const onNavigate = jest.fn();
    render(<DraftHero {...baseProps} onNavigate={onNavigate} />);

    const back = screen.getByTestId('draft-hero-back');
    expect(back.getAttribute('href')).toBe('/baseball/league/7');
    // Marked so the web leave guard still confirms before leaving a live draft.
    expect(back.hasAttribute(LEAVES_DRAFT_ATTRIBUTE)).toBe(true);
    fireEvent.click(back);
    expect(onNavigate).toHaveBeenCalledWith('/baseball/league/7');
  });

  it('leaves modified clicks to the browser', () => {
    const onNavigate = jest.fn();
    render(<DraftHero {...baseProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByTestId('draft-hero-back'), { metaKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('renders no back link without a destination', () => {
    render(<DraftHero {...baseProps} backHref={null} />);

    expect(screen.queryByTestId('draft-hero-back')).toBeNull();
  });
});
