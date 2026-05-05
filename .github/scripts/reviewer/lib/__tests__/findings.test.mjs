import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFindingsFromText,
  tryReformatFindings,
  hasCriticalBlockingFinding,
  gateFindingsBySeverity,
} from '../findings.mjs';

// ---------------------------------------------------------------------------
// parseFindingsFromText
// ---------------------------------------------------------------------------

describe('parseFindingsFromText', () => {
  it('returns ok:true with empty findings for an empty JSON array', () => {
    const result = parseFindingsFromText('[]');
    assert.deepStrictEqual(result, { ok: true, findings: [] });
  });

  it('parses a valid findings array', () => {
    const finding = {
      severity: 'high',
      file: 'src/auth.ts',
      line: 42,
      title: 'SQL injection',
      body: 'Use parameterised queries.',
    };
    const result = parseFindingsFromText(JSON.stringify([finding]));
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.deepStrictEqual(result.findings[0], finding);
  });

  it('strips findings with invalid severity', () => {
    const findings = [
      { severity: 'high', file: null, line: null, title: 'Valid', body: 'ok' },
      {
        severity: 'unknown',
        file: null,
        line: null,
        title: 'Invalid',
        body: 'bad',
      },
    ];
    const result = parseFindingsFromText(JSON.stringify(findings));
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.findings[0].title, 'Valid');
  });

  it('accepts observation severity', () => {
    const finding = {
      severity: 'observation',
      file: 'src/auth.ts',
      line: 10,
      title: 'Race condition correctly handled',
      body: 'The mutex now prevents concurrent writes.',
    };
    const result = parseFindingsFromText(JSON.stringify([finding]));
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.deepStrictEqual(result.findings[0], finding);
  });

  it('handles a prose preamble before the JSON array (Attempt 2)', () => {
    const finding = {
      severity: 'medium',
      file: 'src/util.ts',
      line: null,
      title: 'Missing error handling',
      body: 'Add try/catch.',
    };
    const text = `Here are my findings:\n\n${JSON.stringify([finding])}`;
    const result = parseFindingsFromText(text);
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
  });

  it('handles a fenced ```json block', () => {
    const finding = {
      severity: 'critical',
      file: 'src/index.ts',
      line: 1,
      title: 'Null deref',
      body: 'Guard the value.',
    };
    const text = `\`\`\`json\n${JSON.stringify([finding])}\n\`\`\``;
    const result = parseFindingsFromText(text);
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
  });

  it('handles a prose preamble followed by an embedded ```json fenced block (Attempt 4)', () => {
    const finding = {
      severity: 'high',
      file: 'src/auth.ts',
      line: 5,
      title: 'Missing guard',
      body: 'Add a null check.',
    };
    const text = `Here is my review:\n\`\`\`json\n${JSON.stringify([finding])}\n\`\`\``;
    const result = parseFindingsFromText(text);
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.findings[0].title, 'Missing guard');
  });

  it('handles a single-line outer fence with no language tag (```{...}```)', () => {
    const finding = {
      severity: 'high',
      file: null,
      line: null,
      title: 'Issue',
      body: 'Fix it.',
    };
    const text = `\`\`\`${JSON.stringify([finding])}\`\`\``;
    const result = parseFindingsFromText(text);
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.findings[0].title, 'Issue');
  });

  it('handles a single-line outer fence with json language tag (```json {...}```)', () => {
    const finding = {
      severity: 'medium',
      file: null,
      line: null,
      title: 'Warning',
      body: 'Check this.',
    };
    const text = `\`\`\`json ${JSON.stringify([finding])}\`\`\``;
    const result = parseFindingsFromText(text);
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.findings[0].title, 'Warning');
  });

  it('handles a non-JSON fence before the ```json block (Attempt 4 scans past non-JSON fences)', () => {
    const finding = {
      severity: 'high',
      file: 'src/auth.ts',
      line: 5,
      title: 'Missing guard',
      body: 'Add a null check.',
    };
    // A ```js snippet appears before the actual ```json payload.
    const text = `Here is an example:\n\`\`\`js\nconsole.log("hi");\n\`\`\`\n\nFindings:\n\`\`\`json\n${JSON.stringify([finding])}\n\`\`\``;
    const result = parseFindingsFromText(text);
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.findings[0].title, 'Missing guard');
  });

  it('returns ok:false for pure prose with no JSON array', () => {
    const result = parseFindingsFromText(
      'This is a great PR! No issues found. Keep up the good work.',
    );
    assert.deepStrictEqual(result, { ok: false, findings: [] });
  });

  it('accepts {"findings":[]} object wrapper (empty findings)', () => {
    const result = parseFindingsFromText('{"findings": []}');
    assert.deepStrictEqual(result, { ok: true, findings: [] });
  });

  it('accepts {"findings":[...]} object wrapper with actual findings', () => {
    const finding = {
      severity: 'high',
      file: 'src/auth.ts',
      line: 10,
      title: 'Null deref',
      body: 'Guard the value.',
    };
    const result = parseFindingsFromText(
      JSON.stringify({ findings: [finding] }),
    );
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.deepStrictEqual(result.findings[0], finding);
  });

  it('returns ok:false when the root is a JSON object without a findings key', () => {
    const result = parseFindingsFromText('{"items": []}');
    assert.deepStrictEqual(result, { ok: false, findings: [] });
  });

  it('returns ok:false for malformed JSON', () => {
    const result = parseFindingsFromText('[{severity: "high"}]');
    assert.deepStrictEqual(result, { ok: false, findings: [] });
  });

  it('accepts null file and null line', () => {
    const finding = {
      severity: 'low',
      file: null,
      line: null,
      title: 'Minor issue',
      body: 'Consider refactoring.',
    };
    const result = parseFindingsFromText(JSON.stringify([finding]));
    assert.ok(result.ok);
    assert.deepStrictEqual(result.findings[0], finding);
  });

  it('normalizes omitted file and line to null (Gemini omits optional fields instead of emitting null)', () => {
    // Gemini may omit file/line rather than emitting null when they are not required (LS-3962).
    // parseFindingsFromText normalizes absent fields to null to preserve the Finding contract.
    const finding = {
      severity: 'medium',
      title: 'Missing guard',
      body: 'Add null check.',
    };
    const result = parseFindingsFromText(JSON.stringify([finding]));
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.findings[0].title, 'Missing guard');
    assert.strictEqual(result.findings[0].file, null);
    assert.strictEqual(result.findings[0].line, null);
  });

  it('strips findings with empty title or body', () => {
    const findings = [
      { severity: 'high', file: null, line: null, title: '', body: 'ok' },
      { severity: 'high', file: null, line: null, title: 'ok', body: '  ' },
      {
        severity: 'high',
        file: null,
        line: null,
        title: 'Real',
        body: 'Real body',
      },
    ];
    const result = parseFindingsFromText(JSON.stringify(findings));
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.findings[0].title, 'Real');
  });

  it('recovers from literal newlines inside JSON string values (LS-3966 Gemini raw-newline edge case)', () => {
    // Simulate what parseFindingsFromText receives when Gemini's proto-JSON
    // serialisation emits literal U+000A newlines inside body strings.
    // Standard JSON.parse rejects these; the repair fallback must handle them.
    const bodyText =
      'The `user.profile` property is nullable.\nDirectly accessing `.teams` without a null check causes a TypeError.\nFix: add a null guard.';
    // Construct a JSON string with a literal newline inside the body value.
    const brokenJson = `{"findings":[{"severity":"high","title":"Missing null check","body":"${bodyText}"}]}`;
    // Verify the string is indeed broken JSON (sanity check for the test itself).
    assert.throws(() => JSON.parse(brokenJson), SyntaxError);

    const result = parseFindingsFromText(brokenJson);
    assert.strictEqual(result.ok, true, 'parseFindingsFromText must recover');
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.findings[0].title, 'Missing null check');
    assert.ok(
      result.findings[0].body.includes('user.profile'),
      'body text must be preserved',
    );
  });
});

// ---------------------------------------------------------------------------
// tryReformatFindings
// ---------------------------------------------------------------------------

describe('tryReformatFindings', () => {
  function makeProvider(responseText) {
    return {
      async review() {
        return { text: responseText, usage: {} };
      },
    };
  }

  function makeThrowingProvider() {
    return {
      async review() {
        throw new Error('network error');
      },
    };
  }

  it('returns ok:true when the provider returns parseable JSON', async () => {
    const finding = {
      severity: 'high',
      file: 'src/main.ts',
      line: 10,
      title: 'Null deref',
      body: 'Guard this.',
    };
    const provider = makeProvider(JSON.stringify([finding]));
    const result = await tryReformatFindings('some prose', provider);
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.deepStrictEqual(result.findings[0], finding);
  });

  it('returns ok:true when the provider returns {"findings":[...]} object wrapper', async () => {
    const finding = {
      severity: 'medium',
      file: 'src/util.ts',
      line: null,
      title: 'Missing error handling',
      body: 'Add try/catch.',
    };
    const provider = makeProvider(JSON.stringify({ findings: [finding] }));
    const result = await tryReformatFindings('some prose', provider);
    assert.ok(result.ok);
    assert.strictEqual(result.findings.length, 1);
    assert.deepStrictEqual(result.findings[0], finding);
  });

  it('returns ok:true with empty findings when provider returns []', async () => {
    const provider = makeProvider('[]');
    const result = await tryReformatFindings('looks fine to me', provider);
    assert.deepStrictEqual(result, { ok: true, findings: [] });
  });

  it('returns ok:false when the provider also returns non-JSON', async () => {
    const provider = makeProvider('Still prose output, sorry!');
    const result = await tryReformatFindings('original prose', provider);
    assert.deepStrictEqual(result, { ok: false, findings: [] });
  });

  it('returns ok:false when the provider throws', async () => {
    const provider = makeThrowingProvider();
    const result = await tryReformatFindings('some text', provider);
    assert.deepStrictEqual(result, { ok: false, findings: [] });
  });

  it('passes the raw text to the provider in the user prompt', async () => {
    let capturedUser = '';
    const provider = {
      async review({ user }) {
        capturedUser = user;
        return { text: '[]', usage: {} };
      },
    };
    const rawText = 'UNIQUE_MARKER_12345';
    await tryReformatFindings(rawText, provider);
    assert.ok(
      capturedUser.includes(rawText),
      'Raw text should be included in the reformat user prompt',
    );
  });
});

// ---------------------------------------------------------------------------
// gateFindingsBySeverity
// ---------------------------------------------------------------------------

describe('gateFindingsBySeverity', () => {
  const make = (severity, title = 'T') => ({
    severity,
    file: null,
    line: null,
    title,
    body: 'desc',
  });

  it('routes critical and high to blocking', () => {
    const { blocking } = gateFindingsBySeverity([
      make('critical'),
      make('high'),
    ]);
    assert.strictEqual(blocking.length, 2);
  });

  it('routes medium and low to nonBlocking', () => {
    const { nonBlocking } = gateFindingsBySeverity([
      make('medium'),
      make('low'),
    ]);
    assert.strictEqual(nonBlocking.length, 2);
  });

  it('routes observation to observations bucket', () => {
    const { observations, blocking, nonBlocking, dropped } =
      gateFindingsBySeverity([make('observation', 'Correctly handled')]);
    assert.strictEqual(observations.length, 1);
    assert.strictEqual(observations[0].title, 'Correctly handled');
    assert.strictEqual(blocking.length, 0);
    assert.strictEqual(nonBlocking.length, 0);
    assert.strictEqual(dropped.length, 0);
  });

  it('routes trivia to dropped', () => {
    const { dropped } = gateFindingsBySeverity([make('trivia')]);
    assert.strictEqual(dropped.length, 1);
  });

  it('observations do not affect verdict (blocking stays empty)', () => {
    const { blocking, observations } = gateFindingsBySeverity([
      make('observation'),
      make('observation'),
    ]);
    assert.strictEqual(blocking.length, 0);
    assert.strictEqual(observations.length, 2);
  });

  it('returns empty arrays for all buckets when given no findings', () => {
    const result = gateFindingsBySeverity([]);
    assert.strictEqual(result.blocking.length, 0);
    assert.strictEqual(result.nonBlocking.length, 0);
    assert.strictEqual(result.observations.length, 0);
    assert.strictEqual(result.dropped.length, 0);
  });
});

// ---------------------------------------------------------------------------
// hasCriticalBlockingFinding
// ---------------------------------------------------------------------------

describe('hasCriticalBlockingFinding', () => {
  it('returns true when the only finding is critical', () => {
    assert.ok(
      hasCriticalBlockingFinding([
        {
          severity: 'critical',
          file: null,
          line: null,
          title: 'SQL injection',
          body: 'desc',
        },
      ]),
    );
  });

  it('returns true when one of multiple blocking findings is critical', () => {
    assert.ok(
      hasCriticalBlockingFinding([
        {
          severity: 'high',
          file: null,
          line: null,
          title: 'High issue',
          body: 'desc',
        },
        {
          severity: 'critical',
          file: null,
          line: null,
          title: 'Critical issue',
          body: 'desc',
        },
      ]),
    );
  });

  it('returns false when all blocking findings are high (not critical)', () => {
    assert.strictEqual(
      hasCriticalBlockingFinding([
        {
          severity: 'high',
          file: null,
          line: null,
          title: 'High issue',
          body: 'desc',
        },
      ]),
      false,
    );
  });

  it('returns false for an empty blocking array', () => {
    assert.strictEqual(hasCriticalBlockingFinding([]), false);
  });
});
