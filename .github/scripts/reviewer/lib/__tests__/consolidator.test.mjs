import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consolidate } from '../consolidator.mjs';
import { parseFindingsFromText } from '../findings.mjs';

describe('consolidate — structured JSON mode', () => {
  it('merges findings across passes when every pass.text is a JSON object with `findings`', () => {
    const passes = [
      {
        passName: 'correctness',
        text: JSON.stringify({
          summary: 's1',
          findings: [
            {
              severity: 'high',
              file: 'a.ts',
              line: 1,
              title: 'Bug A',
              body: 'desc A',
            },
          ],
          verdict: 'REQUEST_CHANGES',
        }),
      },
      {
        passName: 'security',
        text: JSON.stringify({
          summary: 's2',
          findings: [
            {
              severity: 'high',
              file: 'b.ts',
              line: 2,
              title: 'Bug B',
              body: 'desc B',
            },
          ],
          verdict: 'REQUEST_CHANGES',
        }),
      },
      {
        passName: 'contract',
        text: JSON.stringify({
          summary: 's3',
          findings: [],
          verdict: 'APPROVED',
        }),
      },
    ];

    const out = consolidate(passes);
    // Round-trip through the production parser to guarantee end-to-end
    // compatibility with the rest of the reviewer pipeline.
    const parsed = parseFindingsFromText(out);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.findings.length, 2);
    assert.strictEqual(parsed.findings[0].title, 'Bug A');
    assert.match(parsed.findings[0].body, /\[correctness\]/);
    assert.match(parsed.findings[0].body, /desc A/);
    assert.strictEqual(parsed.findings[1].title, 'Bug B');
    assert.match(parsed.findings[1].body, /\[security\]/);
  });

  it('combines pass labels when the same finding fingerprint appears in multiple passes', () => {
    const sameFinding = {
      severity: 'high',
      file: 'auth.ts',
      line: 10,
      title: 'SQL injection',
      body: 'Use parameterised queries.',
    };
    const passes = [
      {
        passName: 'correctness',
        text: JSON.stringify({ findings: [sameFinding] }),
      },
      {
        passName: 'security',
        text: JSON.stringify({ findings: [sameFinding] }),
      },
    ];

    const parsed = parseFindingsFromText(consolidate(passes));
    assert.strictEqual(parsed.findings.length, 1);
    assert.match(parsed.findings[0].body, /\[correctness \+ security\]/);
  });

  it('preserves first-seen insertion order across passes', () => {
    const passes = [
      {
        passName: 'correctness',
        text: JSON.stringify({
          findings: [
            {
              severity: 'high',
              file: 'a.ts',
              line: 1,
              title: 'First',
              body: 'real body 1',
            },
          ],
        }),
      },
      {
        passName: 'security',
        text: JSON.stringify({
          findings: [
            {
              severity: 'high',
              file: 'b.ts',
              line: 2,
              title: 'Second',
              body: 'real body 2',
            },
          ],
        }),
      },
    ];
    const parsed = parseFindingsFromText(consolidate(passes));
    assert.deepStrictEqual(
      parsed.findings.map((f) => f.title),
      ['First', 'Second'],
    );
  });

  it('drops findings with empty/missing body instead of fabricating one from the pass label', () => {
    // A finding with an empty body would, naively, get its body prefixed
    // to "[correctness] " — a non-empty string that would slip past
    // parseFindingsFromText's `body.trim() !== ''` filter and surface as a
    // real finding (potentially blocking the PR with no actual content).
    // Consolidator must leave the body empty so the parser drops it.
    const passes = [
      {
        passName: 'correctness',
        text: JSON.stringify({
          findings: [
            {
              severity: 'high',
              file: 'a.ts',
              line: 1,
              title: 'Has body',
              body: 'real explanation',
            },
            {
              severity: 'high',
              file: 'b.ts',
              line: 2,
              title: 'Empty body',
              body: '',
            },
            {
              severity: 'high',
              file: 'c.ts',
              line: 3,
              title: 'Missing body',
              // body intentionally omitted
            },
          ],
        }),
      },
    ];
    const parsed = parseFindingsFromText(consolidate(passes));
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(
      parsed.findings.length,
      1,
      'only the finding with a real body should survive',
    );
    assert.strictEqual(parsed.findings[0].title, 'Has body');
  });

  it('emits a valid empty findings array when every pass returns no findings', () => {
    const passes = [
      { passName: 'correctness', text: JSON.stringify({ findings: [] }) },
      { passName: 'security', text: JSON.stringify({ findings: [] }) },
      { passName: 'contract', text: JSON.stringify({ findings: [] }) },
    ];
    const parsed = parseFindingsFromText(consolidate(passes));
    assert.strictEqual(parsed.ok, true);
    assert.deepStrictEqual(parsed.findings, []);
  });

  it('recovers from literal newlines in pass body text and stays in structured mode (LS-3989)', () => {
    // Simulate a Gemini pass text that has literal U+000A newlines inside a JSON string
    // value — invalid JSON that _tryConsolidateStructured must repair before falling
    // through to free-form mode and losing all structured findings.
    const bodyWithNewlines =
      'Use parameterised queries.\nFor example: SELECT * FROM users WHERE id = ?.\nNever interpolate user input directly.';
    const brokenPassText = `{"findings":[{"severity":"critical","file":"src/db.ts","line":42,"title":"SQL injection","body":"${bodyWithNewlines}"}]}`;
    // Sanity-check: the string is indeed broken JSON.
    assert.throws(() => JSON.parse(brokenPassText), SyntaxError);

    const passes = [
      { passName: 'correctness', text: JSON.stringify({ findings: [] }) },
      { passName: 'security', text: brokenPassText },
      { passName: 'contract', text: JSON.stringify({ findings: [] }) },
    ];

    const out = consolidate(passes);
    const parsed = parseFindingsFromText(out);
    assert.strictEqual(
      parsed.ok,
      true,
      'structured path must survive the repair',
    );
    assert.strictEqual(parsed.findings.length, 1);
    assert.strictEqual(parsed.findings[0].title, 'SQL injection');
    assert.strictEqual(parsed.findings[0].severity, 'critical');
    assert.match(parsed.findings[0].body, /\[security\]/);
    assert.ok(
      parsed.findings[0].body.includes('parameterised queries'),
      'body text must be preserved through the repair',
    );
  });
});

describe('consolidate — free-form text fallback', () => {
  it('falls back to paragraph fingerprinting when any pass is not parseable JSON', () => {
    const passes = [
      {
        passName: 'correctness',
        text: '## Finding\n\nSomething is broken.',
      },
      {
        passName: 'security',
        text: '## Finding\n\nSomething is broken.', // duplicate
      },
      {
        passName: 'contract',
        text: '## Other\n\nA different issue.',
      },
    ];
    const out = consolidate(passes);
    // Free-form mode emits markdown with **[passName]** headers
    assert.match(out, /\*\*\[correctness \+ security\]\*\*/);
    assert.match(out, /\*\*\[contract\]\*\*/);
    assert.match(out, /Something is broken\./);
    assert.match(out, /A different issue\./);
  });

  it('falls back when one pass is JSON without a `findings` array', () => {
    const passes = [
      {
        passName: 'correctness',
        text: JSON.stringify({ findings: [] }),
      },
      {
        passName: 'security',
        text: JSON.stringify({ summary: 'no findings field' }),
      },
    ];
    const out = consolidate(passes);
    // Falls through to free-form, which converts the non-empty JSON-like
    // strings into paragraph blocks. The exact output isn't important —
    // just that the consolidator didn't throw.
    assert.strictEqual(typeof out, 'string');
    assert.ok(out.length > 0);
  });

  it('emits the "no findings" sentinel when free-form passes have no extractable blocks', () => {
    const passes = [
      { passName: 'correctness', text: '   ' },
      { passName: 'security', text: '\n\n' },
    ];
    const out = consolidate(passes);
    assert.match(out, /No significant findings/);
  });
});
