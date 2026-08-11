jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { globToRegex, manageLabels } from './manage-labels';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

interface ManageLabelsResultBody {
  prNumber?: number;
  success?: boolean;
  clearedLabels?: string[];
  requestedLabelsAdded?: string[];
  requestedLabelsRemoved?: string[];
}

function parse(result: {
  content: Array<{ type: string; text: string }>;
}): ManageLabelsResultBody {
  return JSON.parse(result.content[0].text) as ManageLabelsResultBody;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.mockResolvedValue({ owner: 'o', name: 'r' });
});

// ── globToRegex ───────────────────────────────────────────────────────────────

describe('globToRegex', () => {
  it('matches exact strings', () => {
    const re = globToRegex('ci-failure-lint');
    expect(re.test('ci-failure-lint')).toBe(true);
    expect(re.test('ci-failure-lint2')).toBe(false);
  });

  it('* matches any sequence of characters', () => {
    const re = globToRegex('ci-failure-*');
    expect(re.test('ci-failure-lint')).toBe(true);
    expect(re.test('ci-failure-typecheck')).toBe(true);
    expect(re.test('ci-failure-')).toBe(true);
    expect(re.test('bot:ready-for-review')).toBe(false);
    expect(re.test('agent-in-progress')).toBe(false);
  });

  it('? matches exactly one character', () => {
    const re = globToRegex('ci-?');
    expect(re.test('ci-a')).toBe(true);
    expect(re.test('ci-ab')).toBe(false);
    expect(re.test('ci-')).toBe(false);
  });

  it('escapes regex metacharacters in the pattern', () => {
    const re = globToRegex('some.label+here');
    expect(re.test('some.label+here')).toBe(true);
    expect(re.test('someXlabelYhere')).toBe(false);
  });
});

// ── manageLabels validation ───────────────────────────────────────────────────

describe('manageLabels — validation', () => {
  it('errors when add, remove, and clearPattern are all absent', async () => {
    const result = await manageLabels({ prs: [1] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/clearPattern/);
  });

  it('does not error when only clearPattern is provided', async () => {
    // fetchPrLabels GET + no matching labels → no DELETEs
    mockRest.mockResolvedValueOnce([] as never);
    const result = await manageLabels({
      prs: [1],
      clearPattern: 'ci-failure-*',
    });
    expect(result.isError).toBeFalsy();
  });
});

// ── clearPattern — core behaviour ─────────────────────────────────────────────

describe('manageLabels — clearPattern', () => {
  it('removes labels matching the glob pattern', async () => {
    mockRest
      .mockResolvedValueOnce([
        { name: 'ci-failure-lint' },
        { name: 'ci-failure-typecheck' },
        { name: 'bot:ready-for-review' },
      ] as never)
      .mockResolvedValue(undefined); // DELETE calls

    const result = await manageLabels({
      prs: [42],
      clearPattern: 'ci-failure-*',
    });

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.clearedLabels).toEqual([
      'ci-failure-lint',
      'ci-failure-typecheck',
    ]);
    expect(body.requestedLabelsRemoved).toEqual([]);

    // Two DELETE calls for the matched labels, no POST
    const deleteCalls = mockRest.mock.calls.filter(
      ([args]) => args.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0][0].path).toContain('ci-failure-lint');
    expect(deleteCalls[1][0].path).toContain('ci-failure-typecheck');
  });

  it('no-ops and emits empty clearedLabels when no labels match', async () => {
    mockRest.mockResolvedValueOnce([{ name: 'agent-in-progress' }] as never);

    const result = await manageLabels({
      prs: [1],
      clearPattern: 'ci-failure-*',
    });
    const body = parse(result);
    expect(body.clearedLabels).toBeUndefined(); // omitted when empty
    expect(result.isError).toBeFalsy();

    const deleteCalls = mockRest.mock.calls.filter(
      ([args]) => args.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);
  });
});

// ── clearPattern + add + remove composition ───────────────────────────────────

describe('manageLabels — clearPattern composes with add and remove', () => {
  it('runs add and remove alongside clearPattern', async () => {
    // GET labels for clearPattern
    mockRest
      .mockResolvedValueOnce([{ name: 'ci-failure-lint' }] as never)
      .mockResolvedValue(undefined); // POST and DELETE calls

    const result = await manageLabels({
      prs: [7],
      add: ['bot:ready-for-review'],
      remove: ['sweep-claimed'],
      clearPattern: 'ci-failure-*',
    });

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.requestedLabelsAdded).toEqual(['bot:ready-for-review']);
    expect(body.requestedLabelsRemoved).toEqual(['sweep-claimed']);
    expect(body.clearedLabels).toEqual(['ci-failure-lint']);

    const postCalls = mockRest.mock.calls.filter(
      ([args]) => args.method === 'POST',
    );
    const deleteCalls = mockRest.mock.calls.filter(
      ([args]) => args.method === 'DELETE',
    );
    // POST for add, two DELETEs (sweep-claimed + ci-failure-lint)
    expect(postCalls).toHaveLength(1);
    expect(deleteCalls).toHaveLength(2);
  });

  it('does not duplicate a label already in remove[] even if it matches clearPattern', async () => {
    // ci-failure-lint is both in remove[] and matches the pattern
    mockRest
      .mockResolvedValueOnce([{ name: 'ci-failure-lint' }] as never)
      .mockResolvedValue(undefined);

    await manageLabels({
      prs: [3],
      remove: ['ci-failure-lint'],
      clearPattern: 'ci-failure-*',
    });

    const deleteCalls = mockRest.mock.calls.filter(
      ([args]) => args.method === 'DELETE',
    );
    // Only one DELETE — not duplicated
    expect(deleteCalls).toHaveLength(1);
  });
});

// ── standalone add: force remove-then-add when the label is already present (LS-8706) ──

describe('manageLabels — add re-triggers label-gated workflows', () => {
  it('removes then re-adds a label that is already present', async () => {
    mockRest
      .mockResolvedValueOnce([{ name: 'bot:ready-for-review' }] as never) // GET current labels
      .mockResolvedValue(undefined); // DELETE + POST

    const result = await manageLabels({
      prs: [42],
      add: ['bot:ready-for-review'],
    });

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.labelsReapplied).toEqual(['bot:ready-for-review']);

    const calls = mockRest.mock.calls;
    const deleteIdx = calls.findIndex(([args]) => args.method === 'DELETE');
    const postIdx = calls.findIndex(([args]) => args.method === 'POST');
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(postIdx).toBeGreaterThan(deleteIdx);
  });

  it('does a plain add (no delete) when the label is not yet present', async () => {
    mockRest
      .mockResolvedValueOnce([{ name: 'agent-in-progress' }] as never) // GET current labels
      .mockResolvedValue(undefined); // POST

    const result = await manageLabels({
      prs: [42],
      add: ['bot:ready-for-review'],
    });

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.labelsReapplied).toBeUndefined(); // omitted when empty

    const deleteCalls = mockRest.mock.calls.filter(
      ([args]) => args.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);
  });
});

// ── migrated call site: clearPattern replaces the removed clear_ci_failure_labels tool ──

describe('manageLabels — clearPattern as drop-in for ci-failure label clearing', () => {
  it('clears ci-failure-* labels on a single PR', async () => {
    mockRest
      .mockResolvedValueOnce([
        { name: 'ci-failure-format' },
        { name: 'ci-failure-build' },
      ] as never)
      .mockResolvedValue(undefined);

    const result = await manageLabels({
      prs: [99],
      clearPattern: 'ci-failure-*',
    });
    const body = parse(result);

    expect(body.prNumber).toBe(99);
    expect(body.success).toBe(true);
    expect(body.clearedLabels).toEqual([
      'ci-failure-format',
      'ci-failure-build',
    ]);
  });
});
