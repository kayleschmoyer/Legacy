import { buildPfaObjectKey, PFA_PAYLOAD_VERSION } from './s3-payload';

describe('buildPfaObjectKey', () => {
  it('builds the documented pfa/v1/<pfrId>/<season>.json.gz layout', () => {
    expect(buildPfaObjectKey('', 'StenJa00', 1967)).toBe(
      `pfa/v${PFA_PAYLOAD_VERSION}/StenJa00/1967.json.gz`,
    );
  });

  it('normalizes a prefix with leading/trailing slashes', () => {
    expect(buildPfaObjectKey('/some/prefix/', 'StenJa00', 1967)).toBe(
      `some/prefix/pfa/v${PFA_PAYLOAD_VERSION}/StenJa00/1967.json.gz`,
    );
  });

  it('omits the prefix segment entirely for an empty prefix', () => {
    expect(buildPfaObjectKey('', 'StenJa00', 1967)).not.toMatch(/^\//);
  });
});
