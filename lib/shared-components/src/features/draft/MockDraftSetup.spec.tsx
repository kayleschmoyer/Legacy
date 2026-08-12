/**
 * LS-7711 — MockDraftSetup is the shared Mock Draft configuration form adopted
 * by both web and native. These tests cover the form's interactive behavior:
 * default settings payload, setting changes, cancel, error/usage surfaces, and
 * the football preview gate.
 */
import React from 'react';
import { type MockDraftSettings, MockDraftSetup } from './MockDraftSetup';
import { fireEvent, render } from '../../test-utils';

const noop = () => undefined;

describe('MockDraftSetup', () => {
  it('renders the settings options and actions', () => {
    const { getByText } = render(
      <MockDraftSetup onStart={noop} onCancel={noop} />,
    );

    expect(getByText('Draft Mode')).toBeTruthy();
    expect(getByText('Shared')).toBeTruthy();
    expect(getByText('Offline')).toBeTruthy();
    expect(getByText('Number of Teams')).toBeTruthy();
    expect(getByText('Rounds (Roster Size)')).toBeTruthy();
    expect(getByText('Draft Order')).toBeTruthy();
    expect(getByText('Player Pool')).toBeTruthy();
    expect(getByText('All MLB')).toBeTruthy();
    expect(getByText('Snake')).toBeTruthy();
    expect(getByText('Linear')).toBeTruthy();
    expect(getByText('Start Mock Draft')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('calls onStart with the default settings', () => {
    const onStart = jest.fn();
    const { getByText } = render(
      <MockDraftSetup onStart={onStart} onCancel={noop} />,
    );

    fireEvent.click(getByText('Start Mock Draft'));

    expect(onStart).toHaveBeenCalledWith<[MockDraftSettings]>({
      numTeams: 8,
      rosterSize: 10,
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'all',
      sport: 'baseball',
      mode: 'shared',
    });
  });

  it('reflects Offline mode selection in the onStart payload (LS-9144)', () => {
    const onStart = jest.fn();
    const { getByText } = render(
      <MockDraftSetup onStart={onStart} onCancel={noop} />,
    );

    fireEvent.click(getByText('Offline'));
    fireEvent.click(getByText('Start Mock Draft'));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'offline' }),
    );
  });

  it('reflects setting changes in the onStart payload', () => {
    const onStart = jest.fn();
    const { getByText } = render(
      <MockDraftSetup onStart={onStart} onCancel={noop} />,
    );

    // "12" is unambiguous: not a draft-position (max 8 by default) or roster option.
    fireEvent.click(getByText('12'));
    fireEvent.click(getByText('Linear'));
    fireEvent.click(getByText('NL Only'));
    fireEvent.click(getByText('Start Mock Draft'));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        numTeams: 12,
        draftOrder: 'linear',
        playerPool: 'nl',
      }),
    );
  });

  it('calls onCancel when Cancel is pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <MockDraftSetup onStart={noop} onCancel={onCancel} />,
    );

    fireEvent.click(getByText('Cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('surfaces an inline error and the usage label', () => {
    const { getByText } = render(
      <MockDraftSetup
        onStart={noop}
        onCancel={noop}
        error="Something went wrong"
        usageLabel="1 of 2 free mock drafts used this week"
      />,
    );

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('1 of 2 free mock drafts used this week')).toBeTruthy();
  });

  it('hides the Sport selector unless football mock drafts are enabled', () => {
    const { queryByText, rerender, getByText } = render(
      <MockDraftSetup onStart={noop} onCancel={noop} />,
    );
    expect(queryByText('Sport')).toBeNull();

    rerender(
      <MockDraftSetup onStart={noop} onCancel={noop} footballMockEnabled />,
    );
    expect(getByText('Sport')).toBeTruthy();
  });

  it('gates Start behind a preview when football is selected', () => {
    const onStart = jest.fn();
    const { getByText, getByTestId } = render(
      <MockDraftSetup onStart={onStart} onCancel={noop} footballMockEnabled />,
    );

    fireEvent.click(getByText('🏈 Football'));

    // Football is preview-only: the pool preview shows and Start is replaced
    // with a disabled "Coming Soon" affordance that does not fire onStart.
    expect(getByTestId('football-mock-pool-preview')).toBeTruthy();
    fireEvent.click(getByText('Football — Coming Soon'));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('shows a "Have an invite code?" link in Shared mode when onJoinInstead is provided (LS-9181)', () => {
    const onJoinInstead = jest.fn();
    const { getByText, queryByText } = render(
      <MockDraftSetup
        onStart={noop}
        onCancel={noop}
        onJoinInstead={onJoinInstead}
      />,
    );

    const link = getByText("Have an invite code? Join a friend's draft →");
    fireEvent.click(link);
    expect(onJoinInstead).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Offline'));
    expect(
      queryByText("Have an invite code? Join a friend's draft →"),
    ).toBeNull();
  });

  it('hides the join-instead link when onJoinInstead is not provided', () => {
    const { queryByText } = render(
      <MockDraftSetup onStart={noop} onCancel={noop} />,
    );
    expect(
      queryByText("Have an invite code? Join a friend's draft →"),
    ).toBeNull();
  });
});
