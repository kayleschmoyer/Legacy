import {
  __resetLinkTypeCacheForTests,
  fetchLinkTypes,
  type JiraLinkType,
  resolveLinkType,
} from './link-types';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

const TYPES: JiraLinkType[] = [
  { id: '10000', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
  { id: '10001', name: 'Relates', inward: 'relates to', outward: 'relates to' },
  { id: '10002', name: 'Cause', inward: 'is caused by', outward: 'causes' },
  {
    id: '10003',
    name: 'Duplicate',
    inward: 'is duplicated by',
    outward: 'duplicates',
  },
];

describe('fetchLinkTypes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetLinkTypeCacheForTests();
  });

  it('fetches and caches issue link types, avoiding a second request within the TTL', async () => {
    mockJiraRequest.mockResolvedValue({ issueLinkTypes: TYPES });

    const first = await fetchLinkTypes();
    const second = await fetchLinkTypes();

    expect(first).toEqual(TYPES);
    expect(second).toEqual(TYPES);
    expect(mockJiraRequest).toHaveBeenCalledTimes(1);
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/rest/api/3/issueLinkType',
    });
  });
});

describe('resolveLinkType', () => {
  it('matches the exact canonical name', () => {
    expect(resolveLinkType('Blocks', TYPES).resolved).toBe('Blocks');
  });

  it('matches case-insensitively', () => {
    expect(resolveLinkType('blocks', TYPES).resolved).toBe('Blocks');
    expect(resolveLinkType('BLOCKS', TYPES).resolved).toBe('Blocks');
  });

  it('matches an inward/outward phrase to its type name', () => {
    expect(resolveLinkType('is blocked by', TYPES).resolved).toBe('Blocks');
    expect(resolveLinkType('relates to', TYPES).resolved).toBe('Relates');
  });

  it('resolves the "is caused by" alias from the ticket to the Cause type', () => {
    expect(resolveLinkType('is caused by', TYPES).resolved).toBe('Cause');
  });

  it('resolves common aliases not present verbatim on the instance', () => {
    expect(resolveLinkType('blocked by', TYPES).resolved).toBe('Blocks');
    expect(resolveLinkType('duplicates', TYPES).resolved).toBe('Duplicate');
  });

  it('fuzzy-matches a near-miss typo', () => {
    expect(resolveLinkType('Blocs', TYPES).resolved).toBe('Blocks');
  });

  it('returns null with a suggestion and the available names when nothing matches', () => {
    const result = resolveLinkType('completely unrelated type', TYPES);
    expect(result.resolved).toBeNull();
    expect(result.availableNames).toEqual([
      'Blocks',
      'Relates',
      'Cause',
      'Duplicate',
    ]);
  });
});
