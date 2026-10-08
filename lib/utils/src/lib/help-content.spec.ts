import { HELP_FAQ_ITEMS, HELP_HISTORICAL_FAQ_ITEMS } from './help-content';

/**
 * LS-10699: FAQ copy is shared by the web and mobile help screens, so it must
 * only name UI that exists on both — league tabs are Overview / Matchup(s) /
 * … / Commissioner, and Profile Settings edits the username, not a display
 * name.
 */
describe('help FAQ copy', () => {
  const allItems = [...HELP_FAQ_ITEMS, ...HELP_HISTORICAL_FAQ_ITEMS];

  it.each(['Settings tab', 'Matchups tab', 'display name'])(
    'never references nonexistent UI: "%s"',
    (phrase) => {
      for (const item of allItems) {
        expect(item.question).not.toContain(phrase);
        expect(item.answer).not.toContain(phrase);
      }
    },
  );

  it('points league invites at the Invite Friends card on the Overview tab', () => {
    const invite = HELP_FAQ_ITEMS.find((i) =>
      i.question.startsWith('How do I invite'),
    );
    expect(invite?.answer).toContain('Invite Friends card on the Overview tab');
  });
});
