import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFindingsFromText, tryReformatFindings } from '../findings.mjs';

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
