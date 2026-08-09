import { applyMention, getMentionQuery, splitMentions } from './mentions';

describe('getMentionQuery', () => {
  it('returns null when there is no @ before the cursor', () => {
    expect(getMentionQuery('hello there', 5)).toBeNull();
  });

  it('returns the in-progress token after a word-starting @', () => {
    expect(getMentionQuery('hi @jo', 6)).toBe('jo');
  });

  it('returns an empty string right after typing just @', () => {
    expect(getMentionQuery('hi @', 4)).toBe('');
  });

  it('returns null once a space closes the mention token', () => {
    expect(getMentionQuery('hi @jo hey', 10)).toBeNull();
  });

  it('returns null when @ is mid-word (e.g. an email-like token)', () => {
    expect(getMentionQuery('user@jo', 7)).toBeNull();
  });

  it('resolves against the @ nearest the cursor, not the first one', () => {
    expect(getMentionQuery('@foo hi @ba', 11)).toBe('ba');
  });
});

describe('applyMention', () => {
  it('replaces the in-progress token with the selected label plus a trailing space', () => {
    const result = applyMention('hi @jo', 6, 'Johnny Utah');
    expect(result.text).toBe('hi @Johnny Utah ');
    expect(result.cursor).toBe(result.text.length);
  });

  it('preserves text after the cursor', () => {
    const result = applyMention('hi @jo see you there', 6, 'Johnny Utah');
    expect(result.text).toBe('hi @Johnny Utah  see you there');
  });

  it('is a no-op when there is no @ before the cursor', () => {
    const result = applyMention('hello', 5, 'Johnny Utah');
    expect(result).toEqual({ text: 'hello', cursor: 5 });
  });
});

describe('splitMentions', () => {
  it('returns a single plain segment when there are no candidate labels', () => {
    expect(splitMentions('hi @Wolfpack', [])).toEqual([
      { text: 'hi @Wolfpack', isMention: false },
    ]);
  });

  it('splits out a mention that matches a roster label', () => {
    expect(splitMentions('hi @Wolfpack, good game', ['Wolfpack'])).toEqual([
      { text: 'hi ', isMention: false },
      { text: '@Wolfpack', isMention: true },
      { text: ', good game', isMention: false },
    ]);
  });

  it('does not treat an unmatched @token as a mention', () => {
    expect(splitMentions('hi @randomguy', ['Wolfpack'])).toEqual([
      { text: 'hi @randomguy', isMention: false },
    ]);
  });

  it('prefers the longer label when one is a prefix of another', () => {
    expect(
      splitMentions('go @Bears United', ['Bears', 'Bears United']),
    ).toEqual([
      { text: 'go ', isMention: false },
      { text: '@Bears United', isMention: true },
    ]);
  });

  it('matches multiple mentions in one message', () => {
    expect(splitMentions('@Wolfpack vs @Bears', ['Wolfpack', 'Bears'])).toEqual(
      [
        { text: '@Wolfpack', isMention: true },
        { text: ' vs ', isMention: false },
        { text: '@Bears', isMention: true },
      ],
    );
  });
});
