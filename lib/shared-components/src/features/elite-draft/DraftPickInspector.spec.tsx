import React from 'react';
import { DraftPickInspector } from './DraftPickInspector';
import { buildPickInspectorData } from './draftPickInspector';
import { fireEvent, render, screen } from '../../test-utils';

const MADE = buildPickInspectorData({
  round: 4,
  pickLabel: '4.06',
  teamName: 'Iron Horse Club',
  state: 'made',
  playerName: 'Lou Gehrig',
  position: '1B',
  isMine: true,
});

const ON_THE_CLOCK = buildPickInspectorData({
  round: 4,
  pickLabel: '4.07',
  teamName: 'Frozen Tundra',
  state: 'on-the-clock',
});

const UPCOMING = buildPickInspectorData({
  round: 5,
  pickLabel: '5.03',
  teamName: 'Canton Calling',
  state: 'upcoming',
});

describe('DraftPickInspector', () => {
  it('renders nothing when data is null', () => {
    const { container } = render(
      <DraftPickInspector data={null} onClose={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the made variant — eyebrow, player title, meta, and Team/Position/Pick/Status rows', () => {
    render(<DraftPickInspector data={MADE} onClose={jest.fn()} />);

    expect(screen.getByText('Pick 4.06 · Round 4')).toBeTruthy();
    expect(screen.getByTestId('draft-pick-inspector-title').textContent).toBe(
      'Lou Gehrig',
    );
    expect(screen.getByText('1B · drafted by Iron Horse Club')).toBeTruthy();
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('Iron Horse Club')).toBeTruthy();
    expect(screen.getByText('Position')).toBeTruthy();
    expect(screen.getByText('1B')).toBeTruthy();
    expect(screen.getByText('Pick')).toBeTruthy();
    expect(screen.getByText('4.06')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('On your roster')).toBeTruthy();
    expect(screen.queryByTestId('draft-pick-inspector-empty')).toBeNull();
  });

  it('renders the on-the-clock variant with Team/Pick/Status rows and no empty state', () => {
    render(<DraftPickInspector data={ON_THE_CLOCK} onClose={jest.fn()} />);

    expect(screen.getByTestId('draft-pick-inspector-title').textContent).toBe(
      'On the clock',
    );
    expect(screen.getByText('Choosing now')).toBeTruthy();
    expect(screen.queryByTestId('draft-pick-inspector-empty')).toBeNull();
  });

  it('renders the upcoming variant with no rows and an empty-state sentence', () => {
    render(<DraftPickInspector data={UPCOMING} onClose={jest.fn()} />);

    expect(screen.getByTestId('draft-pick-inspector-title').textContent).toBe(
      'Not yet made',
    );
    expect(screen.queryByTestId('draft-pick-inspector-rows')).toBeNull();
    expect(screen.getByTestId('draft-pick-inspector-empty').textContent).toBe(
      'Canton Calling is on the board at 5.03.',
    );
  });

  it('closes from the close button', () => {
    const onClose = jest.fn();
    render(<DraftPickInspector data={MADE} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('draft-pick-inspector-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the keyboard on the close button', () => {
    const onClose = jest.fn();
    render(<DraftPickInspector data={MADE} onClose={onClose} />);

    fireEvent.keyDown(screen.getByTestId('draft-pick-inspector-close'), {
      key: 'Enter',
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop tap', () => {
    const onClose = jest.fn();
    render(<DraftPickInspector data={MADE} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('draft-pick-inspector-overlay'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the card itself is tapped', () => {
    const onClose = jest.fn();
    render(<DraftPickInspector data={MADE} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('draft-pick-inspector'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<DraftPickInspector data={MADE} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen for Escape once closed', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <DraftPickInspector data={MADE} onClose={onClose} />,
    );
    rerender(<DraftPickInspector data={null} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
