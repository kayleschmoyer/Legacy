import {
  HELP_FAQ_ITEMS,
  HELP_HISTORICAL_FAQ_ITEMS,
  SUPPORT_EMAIL,
} from './help-content';

/**
 * LS-10699: FAQ copy is shared by the web and mobile help screens, so it must
 * only name UI that exists on both — league tabs are Overview / Matchup(s) /
 * … / Commissioner, and Profile Settings edits the username, not a display
 * name.
 */
describe('help FAQ copy', () => {
  const allItems = [...HELP_FAQ_ITEMS, ...HELP_HISTORICAL_FAQ_ITEMS];

  it.each(['Settings tab', 'Matchups tab', 'display name', 'top navigation'])(
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

  // LS-10775: a bare "contact support" gave users nowhere to go.
  it('never says "contact support" without naming a channel', () => {
    for (const item of allItems) {
      expect(item.answer).not.toMatch(/contact support\b/i);
    }
  });

  it('gives the support email for missing stats', () => {
    const stats = HELP_FAQ_ITEMS.find((i) =>
      i.question.startsWith('Why are my player statistics'),
    );
    expect(stats?.answer).toContain(SUPPORT_EMAIL);
  });

  it('points league creation at the Home Create League quick action', () => {
    const create = HELP_FAQ_ITEMS.find((i) =>
      i.question.startsWith('How do I create'),
    );
    expect(create?.answer).toContain('Create League in the quick actions');
  });
});
