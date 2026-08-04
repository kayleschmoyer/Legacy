import { leading, typeScale } from './typography';

describe('typography', () => {
  it('mirrors the foundation bundle type scale (px)', () => {
    expect(typeScale.xs).toBe(12);
    expect(typeScale.md).toBe(16);
    expect(typeScale['6xl']).toBe(80);
  });

  it('mirrors the foundation bundle leading (line-height) ramp', () => {
    expect(leading.tight).toBe(1.1);
    expect(leading.snug).toBe(1.3);
    expect(leading.body).toBe(1.55);
    expect(leading.loose).toBe(1.8);
  });
});
