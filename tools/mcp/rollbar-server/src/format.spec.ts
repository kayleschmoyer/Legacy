import {
  occurrenceSummary,
  ROLLBAR_DEFAULT_PER_PAGE,
  type RollbarInstance,
  withPageFullHint,
} from './format';

describe('occurrenceSummary', () => {
  it('uses the message body when present', () => {
    const instance: RollbarInstance = {
      data: { body: { message: { body: 'Something broke' } } },
    };
    expect(occurrenceSummary(instance)).toBe('Something broke');
  });

  it('falls back to the trace exception class and message', () => {
    const instance: RollbarInstance = {
      data: {
        body: {
          trace: {
            exception: { class: 'TypeError', message: 'x is undefined' },
          },
        },
      },
    };
    expect(occurrenceSummary(instance)).toBe('TypeError: x is undefined');
  });

  it('reads the first exception from a trace_chain', () => {
    const instance: RollbarInstance = {
      data: {
        body: {
          trace_chain: [{ exception: { class: 'Error', message: 'boom' } }],
        },
      },
    };
    expect(occurrenceSummary(instance)).toBe('Error: boom');
  });

  it('returns an empty string when no recognizable body is present', () => {
    expect(occurrenceSummary({})).toBe('');
  });

  it('truncates long messages', () => {
    const instance: RollbarInstance = {
      data: { body: { message: { body: 'a'.repeat(500) } } },
    };
    expect(occurrenceSummary(instance).length).toBeLessThanOrEqual(200);
  });
});

describe('withPageFullHint', () => {
  it('returns the table unchanged when the page is not full', () => {
    expect(withPageFullHint('TABLE', 5, 20, 2)).toBe('TABLE');
  });

  it('uses the Rollbar default page size when perPage is unset', () => {
    const full = withPageFullHint(
      'TABLE',
      ROLLBAR_DEFAULT_PER_PAGE,
      undefined,
      2,
    );
    expect(full).toContain('Page full');
    expect(full).toContain('page 2');
    expect(full).toContain('raise perPage');
  });

  it('hints the next page (without the perPage note) when perPage is set and the page is full', () => {
    const full = withPageFullHint('TABLE', 50, 50, 3);
    expect(full).toContain('Page full (50 results)');
    expect(full).toContain('page 3');
    expect(full).not.toContain('raise perPage');
  });
});
