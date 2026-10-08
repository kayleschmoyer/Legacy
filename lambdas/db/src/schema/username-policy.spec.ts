import { checkUsernamePolicy } from './username-policy';

describe('checkUsernamePolicy', () => {
  it.each([
    'admin',
    'Admin',
    'support',
    'moderator',
    'mod',
    'staff',
    'legacy_sports',
    'LegacySports',
    'legacy-fan',
    'Adm1n',
    'admin_',
    's.u.p.p.o.r.t',
    'support123',
  ])('rejects reserved name %s', (name) => {
    expect(checkUsernamePolicy(name)).toBe('reserved');
  });

  it.each(['fuck', 'F_u_c_k', 'sh1t', 'bigshit99', 'xX_nazi_Xx'])(
    'rejects profane name %s',
    (name) => {
      expect(checkUsernamePolicy(name)).toBe('profanity');
    },
  );

  it.each([
    'newname',
    'user42',
    'adminton',
    'classic',
    'hello.world',
    'Mark-T',
  ])('allows ordinary name %s', (name) => {
    expect(checkUsernamePolicy(name)).toBeNull();
  });

  it('lets admins hold reserved names but still blocks profanity', () => {
    expect(checkUsernamePolicy('admin', { isAdmin: true })).toBeNull();
    expect(checkUsernamePolicy('shit', { isAdmin: true })).toBe('profanity');
  });
});
