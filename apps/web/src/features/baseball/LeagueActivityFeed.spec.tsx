import { LOGGER } from '@legacy-sports/logging';
import { eventToActivityItem } from './LeagueActivityFeed';
import { LeagueActivityEventType } from '../../api/db/graphql.generated';

describe('eventToActivityItem', () => {
  const baseEvent = {
    id: 'evt-1',
    leagueId: 42,
    eventType: LeagueActivityEventType.TradeAccepted,
    occurredAt: '2026-01-01T00:00:00.000Z',
    actorUsername: 'alice',
  };

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(LOGGER, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not throw and shows unavailable message for malformed JSON payload', () => {
    expect(() =>
      eventToActivityItem({ ...baseEvent, payload: 'not json' }),
    ).not.toThrow();
    const result = eventToActivityItem({ ...baseEvent, payload: 'not json' });
    expect(result).not.toBeNull();
    expect(result?.type).toBe('trade');
    expect(result?.detail).toBe(
      'A trade was accepted — team details are unavailable.',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Bad activity payload (parse error)',
      expect.objectContaining({
        id: 'evt-1',
        payloadLength: 'not json'.length,
        errorMessage: expect.any(String),
      }),
    );
    // Ensure raw payload content is NOT logged
    const call = warnSpy.mock.calls.find(
      (c) => c[0] === 'Bad activity payload (parse error)',
    );
    expect(call?.[1]).not.toHaveProperty('payloadPreview');
  });

  it('shows unavailable message when payload parses to JSON null', () => {
    const result = eventToActivityItem({ ...baseEvent, payload: 'null' });
    expect(result).not.toBeNull();
    expect(result?.type).toBe('trade');
    expect(result?.detail).toBe(
      'A trade was accepted — team details are unavailable.',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Bad activity payload (not a plain object)',
      expect.objectContaining({
        id: 'evt-1',
        parsedType: 'null',
      }),
    );
    const call = warnSpy.mock.calls.find(
      (c) => c[0] === 'Bad activity payload (not a plain object)',
    );
    expect(call?.[1]).not.toHaveProperty('payloadPreview');
  });

  it('shows unavailable message when payload parses to a JSON array', () => {
    const result = eventToActivityItem({ ...baseEvent, payload: '[]' });
    expect(result).not.toBeNull();
    expect(result?.type).toBe('trade');
    expect(result?.detail).toBe(
      'A trade was accepted — team details are unavailable.',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Bad activity payload (not a plain object)',
      expect.objectContaining({
        id: 'evt-1',
        parsedType: 'object',
      }),
    );
  });

  it('shows unavailable message when payload parses to a JSON primitive (number)', () => {
    const result = eventToActivityItem({ ...baseEvent, payload: '42' });
    expect(result).not.toBeNull();
    expect(result?.type).toBe('trade');
    expect(result?.detail).toBe(
      'A trade was accepted — team details are unavailable.',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Bad activity payload (not a plain object)',
      expect.objectContaining({ parsedType: 'number' }),
    );
  });

  it('does not include raw payload content in warning logs', () => {
    const sensitivePayload = `"${'x'.repeat(500)}"`; // valid JSON string, not an object
    eventToActivityItem({ ...baseEvent, payload: sensitivePayload });
    const call = warnSpy.mock.calls.find(
      (c) => c[0] === 'Bad activity payload (not a plain object)',
    );
    expect(call?.[1]).toEqual(
      expect.objectContaining({
        payloadLength: sensitivePayload.length,
      }),
    );
    expect(call?.[1]).not.toHaveProperty('payloadPreview');
    // No logged field should contain the raw payload characters
    const serialized = JSON.stringify(call?.[1]);
    expect(serialized).not.toContain('xxxx');
  });

  it('returns a valid ActivityItem for a proper object payload', () => {
    const result = eventToActivityItem({
      ...baseEvent,
      payload: JSON.stringify({
        teamAName: 'Sharks',
        teamBName: 'Bears',
      }),
    });
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      id: 'evt-1',
      type: 'trade',
      title: 'Trade accepted',
      detail: 'Sharks and Bears completed a trade.',
      isoDate: '2026-01-01T00:00:00.000Z',
      linkTo: '/leagues/42/trades',
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns a valid ActivityItem with generic fallback when payload is missing entirely', () => {
    const result = eventToActivityItem({ ...baseEvent, payload: null });
    expect(result).not.toBeNull();
    expect(result?.type).toBe('trade');
    expect(result?.detail).toBe('alice accepted a trade offer.');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns null when eventType is missing', () => {
    const result = eventToActivityItem({
      ...baseEvent,
      eventType: null,
      payload: '{}',
    });
    expect(result).toBeNull();
  });
});
