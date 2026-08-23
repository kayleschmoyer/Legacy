import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  applyMarker,
  buildMarkerBlock,
  extractKeys,
  parseMarker,
  planRepair,
  stripMarkerBlocks,
} from '../jira-link-marker.mjs';

const marker = (primary, related) =>
  [
    '<!-- jira-link',
    `primary: ${primary}`,
    ...(related ? [`related: ${related}`] : []),
    '-->',
  ].join('\n');

describe('parseMarker', () => {
  it('accepts a well-formed marker', () => {
    const result = parseMarker(`${marker('LS-1234')}\n\n## Summary`);
    assert.equal(result.present, true);
    assert.equal(result.primary, 'LS-1234');
    assert.deepEqual(result.errors, []);
  });

  it('reports a missing marker', () => {
    const result = parseMarker('## Summary\n\nno linkage here');
    assert.equal(result.present, false);
    assert.equal(result.primary, null);
    assert.match(result.errors[0], /no `<!-- jira-link -->` marker/);
  });

  it('reports duplicate marker blocks', () => {
    const result = parseMarker(`${marker('LS-1')}\n\n${marker('LS-2')}`);
    assert.equal(result.blockCount, 2);
    assert.equal(result.primary, null);
    assert.match(result.errors[0], /2 jira-link markers/);
  });

  it('reports a marker with no primary line', () => {
    const result = parseMarker('<!-- jira-link -->\n\nbody');
    assert.equal(result.present, true);
    assert.match(result.errors[0], /no `primary:` line/);
  });

  it('reports the inline key=value form agents keep writing', () => {
    const result = parseMarker('<!-- jira-link primary=LS-1234 -->\n\nbody');
    assert.match(result.errors[0], /no `primary:` line/);
  });

  it('reports more than one primary line', () => {
    const result = parseMarker(
      '<!-- jira-link\nprimary: LS-1\nprimary: LS-2\n-->',
    );
    assert.match(result.errors[0], /2 `primary:` lines/);
  });

  it('rejects a malformed primary value', () => {
    const result = parseMarker('<!-- jira-link\nprimary: ls-1234\n-->');
    assert.equal(result.primary, null);
    assert.match(result.errors[0], /is not a valid value/);
  });

  it('accepts primary: none', () => {
    const result = parseMarker(marker('none'));
    assert.equal(result.primary, 'none');
    assert.deepEqual(result.errors, []);
  });

  it('ignores markers quoted in code (LS-7914)', () => {
    const body = [
      'Prose about `<!-- jira-link -->` markers.',
      '',
      '```',
      marker('LS-9'),
      '```',
      '',
      marker('LS-1234'),
    ].join('\n');
    const result = parseMarker(body);
    assert.equal(result.blockCount, 1);
    assert.equal(result.primary, 'LS-1234');
  });

  it('collects related keys and flags malformed ones', () => {
    const result = parseMarker(marker('LS-1', 'LS-2, LS-3'));
    assert.deepEqual(result.related, ['LS-2', 'LS-3']);
    const bad = parseMarker(marker('LS-1', 'LS-2, nope'));
    assert.deepEqual(bad.related, ['LS-2']);
    assert.match(bad.errors[0], /contains "nope"/);
  });
});

describe('parseMarker with CRLF', () => {
  it('trims the carriage return off primary and related values', () => {
    const result = parseMarker(
      '<!-- jira-link\r\nprimary: LS-1\r\nrelated: LS-2, LS-3\r\n-->\r\n',
    );
    assert.equal(result.primary, 'LS-1');
    assert.deepEqual(result.related, ['LS-2', 'LS-3']);
    assert.deepEqual(result.errors, []);
  });
});

describe('extractKeys', () => {
  it('returns distinct keys in first-seen order', () => {
    assert.deepEqual(extractKeys('LS-2 fix(x): follow-up to LS-1 and LS-2'), [
      'LS-2',
      'LS-1',
    ]);
    assert.deepEqual(extractKeys('chore(deps): bump'), []);
  });
});

describe('stripMarkerBlocks / applyMarker', () => {
  it('strips the comment and its visible line together', () => {
    const body = `${buildMarkerBlock({ primary: 'LS-1234' })}\n\n## Summary`;
    assert.equal(stripMarkerBlocks(body), '## Summary');
  });

  it('leaves a body with no marker untouched', () => {
    assert.equal(stripMarkerBlocks('## Summary'), '## Summary');
  });

  it('prepends comment and visible line when the body has neither', () => {
    const result = applyMarker('## Summary', { primary: 'LS-1234' });
    assert.match(
      result,
      /^<!-- jira-link\nprimary: LS-1234\n-->\n\n\*\*Jira:\*\* \[LS-1234\]/,
    );
    assert.match(result, /## Summary$/);
  });

  it('prepends only the comment when the body already links the ticket', () => {
    const result = applyMarker(
      '## Context\n\n**Jira:** [LS-1234](https://bkrupa.atlassian.net/browse/LS-1234)',
      { primary: 'LS-1234' },
    );
    assert.equal(result.match(/\*\*Jira:\*\*/g).length, 1);
    assert.match(result, /^<!-- jira-link\nprimary: LS-1234\n-->/);
  });

  it('replaces every existing block rather than adding another', () => {
    const body = `${marker('LS-1')}\n\n${marker('LS-2')}\n\n## Summary`;
    const result = applyMarker(body, { primary: 'LS-3' });
    assert.equal(parseMarker(result).blockCount, 1);
    assert.equal(parseMarker(result).primary, 'LS-3');
  });

  it('handles CRLF bodies the same as LF (GitHub stores CRLF)', () => {
    const crlf =
      '<!-- jira-link\r\nprimary: LS-9999\r\n-->\r\n\r\n' +
      '**Jira:** [LS-9999](https://bkrupa.atlassian.net/browse/LS-9999)\r\n\r\n## Summary';
    assert.equal(parseMarker(crlf).primary, 'LS-9999');
    assert.equal(stripMarkerBlocks(crlf), '## Summary');

    // The stale visible line must go with the comment, or a repair leaves the
    // body linking one ticket while declaring another.
    const repaired = applyMarker(crlf, { primary: 'LS-1234' });
    assert.equal(repaired.match(/\*\*Jira:\*\*/g).length, 1);
    assert.match(repaired, /\*\*Jira:\*\* \[LS-1234\]/);
    assert.equal(parseMarker(repaired).primary, 'LS-1234');
  });

  it('emits the comment alone for primary: none', () => {
    assert.equal(buildMarkerBlock({ primary: 'none' }), marker('none'));
  });
});

describe('planRepair', () => {
  it('repairs a body with no marker from the title key', () => {
    const plan = planRepair('## Summary', 'LS-1234 fix(x): y');
    assert.equal(plan.repairable, true);
    assert.equal(plan.primary, 'LS-1234');
    const reparsed = parseMarker(plan.body);
    assert.equal(reparsed.primary, 'LS-1234');
  });

  it('repairs the malformed forms agents write by hand', () => {
    for (const bad of [
      '<!-- jira-link -->',
      '<!-- jira-link primary=LS-1234 -->',
      '<!-- jira-link\nprimary: ls-1234\n-->',
      `${marker('LS-1234')}\n\n${marker('LS-1234')}`,
    ]) {
      const plan = planRepair(`${bad}\n\n## Summary`, 'LS-1234 fix(x): y');
      assert.equal(plan.repairable, true, `expected repair for: ${bad}`);
      const reparsed = parseMarker(plan.body);
      assert.equal(reparsed.blockCount, 1);
      assert.equal(reparsed.primary, 'LS-1234');
      assert.deepEqual(reparsed.errors, []);
    }
  });

  it('preserves well-formed related keys through a repair', () => {
    const plan = planRepair(
      '<!-- jira-link\nrelated: LS-2, LS-3\n-->\n\n## Summary',
      'LS-1 fix(x): y',
    );
    assert.equal(plan.repairable, true);
    assert.deepEqual(parseMarker(plan.body).related, ['LS-2', 'LS-3']);
  });

  it('refuses when the title carries no key', () => {
    const plan = planRepair('## Summary', 'chore(deps): bump');
    assert.equal(plan.repairable, false);
    assert.match(plan.reason, /no LS-#### key/);
  });

  it('refuses when the title carries more than one key', () => {
    const plan = planRepair('## Summary', 'LS-1 LS-2 fix(x): y');
    assert.equal(plan.repairable, false);
    assert.match(plan.reason, /ambiguous/);
  });

  it('refuses to overrule a declaration that disagrees with the title', () => {
    const plan = planRepair(marker('LS-9999'), 'LS-1234 fix(x): y');
    assert.equal(plan.repairable, false);
    assert.match(plan.reason, /judgement call/);
  });

  it('refuses to overrule a deliberate primary: none opt-out', () => {
    const plan = planRepair(marker('none'), 'LS-1234 fix(x): y');
    assert.equal(plan.repairable, false);
    assert.match(plan.reason, /opt-out is deliberate/);
  });

  it('is idempotent — a repaired body needs no second repair', () => {
    const first = planRepair('## Summary', 'LS-1234 fix(x): y');
    assert.deepEqual(parseMarker(first.body).errors, []);
    const second = planRepair(first.body, 'LS-1234 fix(x): y');
    assert.equal(second.repairable, true);
    assert.equal(second.body, first.body);
  });
});
