/**
 * LS-7711 — MockDraftSetup is the shared Mock Draft configuration form adopted
 * by both web and native. These tests cover the form's interactive behavior:
 * default settings payload, setting changes, cancel, error/usage surfaces, and
 * the sport-aware player pool (LS-9470).
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
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'all',
      sport: 'baseball',
      mode: 'shared',
      controlAllTeams: false,
      // Shared lobbies default to private (LS-10076).
      isPublic: false,
    });
  });

  it('does not offer a roster-size setting — a mock always drafts the full default roster (LS-10086)', () => {
    const { queryByText } = render(
      <MockDraftSetup onStart={noop} onCancel={noop} />,
    );

    expect(queryByText('Rounds (Roster Size)')).toBeNull();
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

  it('renders Control All Teams as a visible upgrade surface for non-entitled users, not hidden (LS-9253)', () => {
    const { getByText } = render(
      <MockDraftSetup onStart={noop} onCancel={noop} />,
    );

    expect(getByText('Control All Teams')).toBeTruthy();
    expect(getByText('Off')).toBeTruthy();
    expect(getByText('On')).toBeTruthy();
  });

  it('routes a non-entitled user who taps the locked "On" option to the upgrade callback instead of enabling it', () => {
    const onStart = jest.fn();
    const onControlAllTeamsUpgrade = jest.fn();
    const { getByText } = render(
      <MockDraftSetup
        onStart={onStart}
        onCancel={noop}
        isControlAllTeamsEntitled={false}
        onControlAllTeamsUpgrade={onControlAllTeamsUpgrade}
      />,
    );

    fireEvent.click(getByText('On'));
    expect(onControlAllTeamsUpgrade).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Start Mock Draft'));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ controlAllTeams: false }),
    );
  });

  it('lets an entitled user enable Control All Teams, which also forces offline mode in the onStart payload', () => {
    const onStart = jest.fn();
    const onControlAllTeamsUpgrade = jest.fn();
    const { getByText } = render(
      <MockDraftSetup
        onStart={onStart}
        onCancel={noop}
        isControlAllTeamsEntitled
        onControlAllTeamsUpgrade={onControlAllTeamsUpgrade}
      />,
    );

    fireEvent.click(getByText('On'));
    fireEvent.click(getByText('Start Mock Draft'));

    expect(onControlAllTeamsUpgrade).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ controlAllTeams: true, mode: 'offline' }),
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

  it('starts a football mock draft with a football player pool (LS-9470)', () => {
    const onStart = jest.fn();
    const { getByText } = render(
      <MockDraftSetup onStart={onStart} onCancel={noop} footballMockEnabled />,
    );

    fireEvent.click(getByText('🏈 Football'));
    fireEvent.click(getByText('AFC Only'));
    fireEvent.click(getByText('Start Mock Draft'));

    expect(onStart).toHaveBeenCalledWith<[MockDraftSettings]>({
      numTeams: 8,
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'afc',
      sport: 'football',
      mode: 'shared',
      controlAllTeams: false,
      isPublic: false,
    });
  });

  it('swaps the Player Pool options with the selected sport (LS-9470)', () => {
    const onSportChange = jest.fn();
    const { getByText, queryByText } = render(
      <MockDraftSetup
        onStart={noop}
        onCancel={noop}
        footballMockEnabled
        onSportChange={onSportChange}
      />,
    );

    // Baseball (default) exposes the MLB pools only.
    expect(getByText('All MLB')).toBeTruthy();
    expect(queryByText('AFC Only')).toBeNull();

    fireEvent.click(getByText('🏈 Football'));

    expect(onSportChange).toHaveBeenCalledWith('football');
    expect(getByText('All NFL')).toBeTruthy();
    expect(getByText('AFC Only')).toBeTruthy();
    expect(getByText('NFC Only')).toBeTruthy();
    expect(queryByText('All MLB')).toBeNull();
    expect(queryByText('NL Only')).toBeNull();
  });

  it('resets a baseball-only pool when switching to football (LS-9470)', () => {
    const onStart = jest.fn();
    const { getByText } = render(
      <MockDraftSetup onStart={onStart} onCancel={noop} footballMockEnabled />,
    );

    // Pick an AL-only baseball pool, then switch sports: the stale 'al' value
    // would be rejected by createMockDraft, so it must reset to 'all'.
    fireEvent.click(getByText('AL Only'));
    fireEvent.click(getByText('🏈 Football'));
    fireEvent.click(getByText('Start Mock Draft'));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'football', playerPool: 'all' }),
    );
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

  // LS-10076 — a Shared lobby can be opened up so anyone with the link can
  // join without an invite code. Offline drafts have no lobby, so the toggle
  // only exists in Shared mode.
  it('reflects the Public lobby selection in the onStart payload (LS-10076)', () => {
    const onStart = jest.fn();
    const { getByText } = render(
      <MockDraftSetup onStart={onStart} onCancel={noop} />,
    );

    fireEvent.click(getByText('Public'));
    fireEvent.click(getByText('Start Mock Draft'));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'shared', isPublic: true }),
    );
  });

  it('hides the visibility toggle in Offline mode and reports isPublic=false (LS-10076)', () => {
    const onStart = jest.fn();
    const { getByText, queryByText } = render(
      <MockDraftSetup onStart={onStart} onCancel={noop} />,
    );

    fireEvent.click(getByText('Public'));
    fireEvent.click(getByText('Offline'));
    expect(queryByText('Public')).toBeNull();
    expect(queryByText('Private')).toBeNull();

    fireEvent.click(getByText('Start Mock Draft'));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'offline', isPublic: false }),
    );
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
