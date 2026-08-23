import { GraphQLError } from 'graphql';
import { validateGifUrl } from './validate-gif-url';

describe('validateGifUrl', () => {
  it('returns null when no gifUrl is provided', () => {
    expect(validateGifUrl(undefined)).toBeNull();
    expect(validateGifUrl(null)).toBeNull();
    expect(validateGifUrl('')).toBeNull();
    expect(validateGifUrl('   ')).toBeNull();
  });

  it.each([
    ['giphy.com root', 'https://giphy.com/gifs/abc123'],
    ['giphy.com subdomain', 'https://media0.giphy.com/media/abc/giphy.gif'],
    ['tenor.com root', 'https://tenor.com/view/abc-gif'],
    ['tenor.com subdomain', 'https://media.tenor.com/abc/tenor.gif'],
  ])('accepts a trimmed %s URL', (_label, url) => {
    expect(validateGifUrl(`  ${url}  `)).toBe(url);
  });

  // FLD-047: arbitrary hosts must be rejected so a malicious gifUrl can't be
  // persisted and broadcast as a tracking pixel / NSFW image.
  it('rejects a URL from a non-allowlisted host', () => {
    expect(() => validateGifUrl('https://malicious.example/track.gif')).toThrow(
      'gifUrl must be hosted on giphy.com or tenor.com',
    );
  });

  it('rejects a host that merely contains the allowlisted domain as a substring', () => {
    expect(() =>
      validateGifUrl('https://giphy.com.evil.com/track.gif'),
    ).toThrow('gifUrl must be hosted on giphy.com or tenor.com');
  });

  it('rejects non-HTTPS protocols', () => {
    expect(() => validateGifUrl('http://giphy.com/gifs/abc123')).toThrow(
      'gifUrl must use HTTPS',
    );
  });

  it('rejects malformed URLs', () => {
    expect(() => validateGifUrl('not a url')).toThrow(
      'gifUrl must be a valid URL',
    );
  });

  it('rejects a URL that embeds credentials', () => {
    expect(() =>
      validateGifUrl('https://user:pass@giphy.com/gifs/abc123'),
    ).toThrow('gifUrl must not contain credentials');
  });

  it('rejects URLs longer than 2048 characters', () => {
    const longUrl = `https://giphy.com/${'a'.repeat(2048)}`;
    expect(() => validateGifUrl(longUrl)).toThrow(
      'gifUrl is too long (max 2048 chars)',
    );
  });

  it('throws a client-facing UserInputError (BAD_USER_INPUT), not a masked internal error', () => {
    try {
      validateGifUrl('https://malicious.example/track.gif');
      throw new Error('expected validateGifUrl to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GraphQLError);
      expect((err as GraphQLError).extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
      });
    }
  });
});
