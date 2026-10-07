import React from 'react';
import { PlayerFeedCard } from './PlayerFeedCard';
import { fireEvent, render, screen } from '../../../test-utils';

const makeProps = () => ({
  sport: 'baseball' as const,
  position: 'OF',
  name: 'Barry Bonds',
  subStats: 'HR 762 · RBI 1,996 · AVG .298',
  fpts: '14,208',
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

  test('renders the FPTS label', () => {
    render(<PlayerFeedCard {...makeProps()} />);

    expect(screen.getByText('FPTS')).toBeInTheDocument();
  });

  test('calls onPress when tapped', () => {
    const props = makeProps();
    render(<PlayerFeedCard {...props} />);

    fireEvent.click(screen.getByTestId('player-feed-card'));

    expect(props.onPress).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['Enter', 'Enter'],
    ['Space', ' '],
  ])(
    'calls onPress when %s is pressed on the focused card (LS-10665)',
    (_, key) => {
      const props = makeProps();
      render(<PlayerFeedCard {...props} />);

      const card = screen.getByTestId('player-feed-card');
      expect(card).toHaveAttribute('tabindex', '0');
      fireEvent.keyDown(card, { key });

      expect(props.onPress).toHaveBeenCalledTimes(1);
    },
  );

  test('ignores other keys', () => {
    const props = makeProps();
    render(<PlayerFeedCard {...props} />);

    fireEvent.keyDown(screen.getByTestId('player-feed-card'), { key: 'a' });

    expect(props.onPress).not.toHaveBeenCalled();
  });

  test('does not render a projection line when omitted', () => {
    render(<PlayerFeedCard {...makeProps()} />);

    expect(screen.queryByText(/pts\/g/)).not.toBeInTheDocument();
  });

  test('renders the projection line when provided (LS-9072)', () => {
    render(<PlayerFeedCard {...makeProps()} projection="24.3 pts/g" />);

    expect(screen.getByText('24.3 pts/g')).toBeInTheDocument();
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
