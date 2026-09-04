import { render, screen } from '@testing-library/react';
import { SystemMessageCard } from './SystemMessageCard';
import type { ChatMessage } from '../../hooks/useLeagueChat';

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 1,
    userId: null,
    username: '',
    avatarUrl: null,
    messageText: 'default text',
    messageType: 'system_scoring_changed',
    metadata: null,
    gifUrl: null,
    createdAt: '2026-03-31T10:00:00Z',
    ...overrides,
  };
}

describe('SystemMessageCard — scoring system notices (LS-9666)', () => {
  const formatTime = (iso: string) => iso;

  it('renders a system_scoring_changed message as a generic notice', () => {
    render(
      <SystemMessageCard
        message={makeMessage({
          messageType: 'system_scoring_changed',
          messageText: 'commish updated scoring settings: HR: 4x → 6x',
        })}
        formatTime={formatTime}
      />,
    );

    expect(
      screen.getByText('commish updated scoring settings: HR: 4x → 6x'),
    ).toBeTruthy();
  });

  it('renders a system_scores_recomputed message as a generic notice', () => {
    render(
      <SystemMessageCard
        message={makeMessage({
          messageType: 'system_scores_recomputed',
          messageText:
            'Scores were recomputed for 3 matchups (commissioner recalculation)',
        })}
        formatTime={formatTime}
      />,
    );

    expect(
      screen.getByText(
        'Scores were recomputed for 3 matchups (commissioner recalculation)',
      ),
    ).toBeTruthy();
  });
});
