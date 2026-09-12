import { describe, expect, it } from '@jest/globals';
import {
  AUDIT_CLI_USAGE,
  AuditCliArgsError,
  parseAuditCliArgs,
} from './audit-cli-args.js';

describe('parseAuditCliArgs (LS-8890)', () => {
  it('defaults to an empty param set with no arguments', () => {
    expect(parseAuditCliArgs([])).toEqual({});
  });

  it('parses bare boolean flags as true', () => {
    expect(parseAuditCliArgs(['--auditMode', '--scanScratch'])).toEqual({
      auditMode: true,
      scanScratch: true,
    });
  });

  it('honors an explicit --flag=false', () => {
    expect(parseAuditCliArgs(['--gapsOnly=false'])).toEqual({
      gapsOnly: false,
    });
  });

  it('accepts both --flag value and --flag=value spellings', () => {
    expect(parseAuditCliArgs(['--project', 'a-slug'])).toEqual({
      project: 'a-slug',
    });
    expect(parseAuditCliArgs(['--project=a-slug'])).toEqual({
      project: 'a-slug',
    });
  });

  it('parses the CCR recovery invocation end to end', () => {
    // The exact shape `make audit-session ARGS="--auditMode"` produces, plus
    // the sessionToolNames the audit-workflow doc tells callers to pass.
    expect(
      parseAuditCliArgs([
        '--auditMode',
        '--sessionToolNames',
        'github_open_pr, jira_view ,',
      ]),
    ).toEqual({
      auditMode: true,
      sessionToolNames: ['github_open_pr', 'jira_view'],
    });
  });

  it('coerces --pid to a number', () => {
    expect(parseAuditCliArgs(['--pid', '520'])).toEqual({ pid: 520 });
  });

  it('rejects a non-positive or non-integer --pid', () => {
    expect(() => parseAuditCliArgs(['--pid', '0'])).toThrow(AuditCliArgsError);
    expect(() => parseAuditCliArgs(['--pid', 'abc'])).toThrow(
      /must be a positive integer/,
    );
  });

  it('rejects unknown options rather than silently ignoring them', () => {
    // A typo'd flag here would otherwise yield a confusingly empty audit on
    // the one code path a CCR session has left.
    expect(() => parseAuditCliArgs(['--auditMdoe'])).toThrow(
      /Unknown option: --auditMdoe/,
    );
  });

  it('rejects a positional argument', () => {
    expect(() => parseAuditCliArgs(['auditMode'])).toThrow(
      /Unexpected argument: auditMode/,
    );
  });

  it('rejects a string flag with a missing value', () => {
    expect(() => parseAuditCliArgs(['--project'])).toThrow(
      /Missing value for --project/,
    );
    expect(() => parseAuditCliArgs(['--project', '--auditMode'])).toThrow(
      /Missing value for --project/,
    );
  });

  it('surfaces usage text for --help', () => {
    expect(() => parseAuditCliArgs(['--help'])).toThrow(AUDIT_CLI_USAGE);
    expect(() => parseAuditCliArgs(['-h'])).toThrow(AuditCliArgsError);
  });
});
