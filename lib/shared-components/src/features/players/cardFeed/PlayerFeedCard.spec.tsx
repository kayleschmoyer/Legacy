import React from 'react';
import { PlayerFeedCard } from './PlayerFeedCard';
import { fireEvent, render, screen } from '../../../test-utils';

const makeProps = () => ({
  sport: 'baseball' as const,
  position: 'OF',
  name: 'Barry Bonds',
  subStats: 'HR 762 · RBI 1,996 · AVG .298',
  fpts: '14,208',
  trend: 'up' as const,
  onPress: jest.fn(),
});

describe('PlayerFeedCard', () => {
  test('renders name, sub-stats, position, and FPTS', () => {
    render(<PlayerFeedCard {...makeProps()} />);

    expect(screen.getByText('Barry Bonds')).toBeInTheDocument();
    expect(
      screen.getByText('HR 762 · RBI 1,996 · AVG .298'),
    ).toBeInTheDocument();
    expect(screen.getByText('OF')).toBeInTheDocument();
    expect(screen.getByText('14,208')).toBeInTheDocument();
  });

  test('renders the up-trend glyph and label', () => {
    render(<PlayerFeedCard {...makeProps()} />);

    expect(screen.getByText('▲ FPTS')).toBeInTheDocument();
  });

  test('renders the down-trend glyph', () => {
    render(<PlayerFeedCard {...makeProps()} trend="down" />);

    expect(screen.getByText('▼ FPTS')).toBeInTheDocument();
  });

  test('renders the flat-trend glyph', () => {
    render(<PlayerFeedCard {...makeProps()} trend="flat" />);

    expect(screen.getByText('— FPTS')).toBeInTheDocument();
  });

  test('calls onPress when tapped', () => {
    const props = makeProps();
    render(<PlayerFeedCard {...props} />);

    fireEvent.click(screen.getByTestId('player-feed-card'));

    expect(props.onPress).toHaveBeenCalledTimes(1);
  });

  test('renders a football card sub-stat line', () => {
    render(
      <PlayerFeedCard
        {...makeProps()}
        sport="football"
        position="QB"
        name="Josh Allen"
        subStats="BUF · YDS 4,587 · TD 42"
      />,
    );

    expect(screen.getByText('Josh Allen')).toBeInTheDocument();
    expect(screen.getByText('BUF · YDS 4,587 · TD 42')).toBeInTheDocument();
  });
});
