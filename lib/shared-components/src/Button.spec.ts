import { resolveSize } from './Button';

describe('resolveSize', () => {
  it('defaults to "md" when no size is provided', () => {
    expect(resolveSize(undefined)).toBe('md');
  });

  it('passes design-system sizes through unchanged', () => {
    expect(resolveSize('sm')).toBe('sm');
    expect(resolveSize('md')).toBe('md');
    expect(resolveSize('lg')).toBe('lg');
  });

  it('maps legacy Tamagui sizes $1-$3 to "sm"', () => {
    expect(resolveSize('$1')).toBe('sm');
    expect(resolveSize('$2')).toBe('sm');
    expect(resolveSize('$3')).toBe('sm');
  });

  it('maps legacy Tamagui size $4 to "md"', () => {
    expect(resolveSize('$4')).toBe('md');
  });

  it('maps legacy Tamagui sizes $5-$10 to "lg"', () => {
    expect(resolveSize('$5')).toBe('lg');
    expect(resolveSize('$6')).toBe('lg');
    expect(resolveSize('$7')).toBe('lg');
    expect(resolveSize('$8')).toBe('lg');
    expect(resolveSize('$9')).toBe('lg');
    expect(resolveSize('$10')).toBe('lg');
  });
});
