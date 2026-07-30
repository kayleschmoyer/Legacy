import React from 'react';
import { PositionChipRail } from './PositionChipRail';
import { BASEBALL_CARD_POSITIONS } from './cardFeedHelpers';
import { fireEvent, render, screen } from '../../../test-utils';

describe('PositionChipRail', () => {
  test('renders every chip in the given position list', () => {
    render(
      <PositionChipRail
        sport="baseball"
        positions={BASEBALL_CARD_POSITIONS}
        value="ALL"
        onChange={jest.fn()}
      />,
    );

    for (const position of BASEBALL_CARD_POSITIONS) {
      expect(screen.getByText(position)).toBeInTheDocument();
    }
  });

  test('calls onChange with the tapped position', () => {
    const onChange = jest.fn();
    render(
      <PositionChipRail
        sport="baseball"
        positions={BASEBALL_CARD_POSITIONS}
        value="ALL"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('players-card-feed-position-chips-SS'));

    expect(onChange).toHaveBeenCalledWith('SS');
  });

  test('does not re-fire onChange when tapping the already-active chip', () => {
    const onChange = jest.fn();
    render(
      <PositionChipRail
        sport="baseball"
        positions={BASEBALL_CARD_POSITIONS}
        value="SS"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('players-card-feed-position-chips-SS'));

    expect(onChange).not.toHaveBeenCalled();
  });

  test('marks the active chip as selected for accessibility', () => {
    render(
      <PositionChipRail
        sport="baseball"
        positions={BASEBALL_CARD_POSITIONS}
        value="C"
        onChange={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('players-card-feed-position-chips-C'),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByTestId('players-card-feed-position-chips-ALL'),
    ).toHaveAttribute('aria-selected', 'false');
  });
});
