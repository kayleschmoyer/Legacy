import { buildFreeAgentAriaLabel } from './LeagueFreeAgents';

describe('buildFreeAgentAriaLabel', () => {
  it('produces "Add First Last" for a fully-populated player', () => {
    expect(buildFreeAgentAriaLabel('John', 'Adams')).toBe('Add John Adams');
  });

  it('omits the empty first name so the label has no double space', () => {
    expect(buildFreeAgentAriaLabel('', 'Adams')).toBe('Add Adams');
  });

  it('treats null firstName the same as empty', () => {
    expect(buildFreeAgentAriaLabel(null, 'Adams')).toBe('Add Adams');
  });

  it('treats undefined firstName the same as empty', () => {
    expect(buildFreeAgentAriaLabel(undefined, 'Adams')).toBe('Add Adams');
  });

  it('omits the empty last name', () => {
    expect(buildFreeAgentAriaLabel('John', '')).toBe('Add John');
  });

  it('handles whitespace-only name parts as empty', () => {
    expect(buildFreeAgentAriaLabel('  ', 'Adams')).toBe('Add Adams');
  });
});
