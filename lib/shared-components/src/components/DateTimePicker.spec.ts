import { to12Hour, to24Hour } from './dateTimePickerUtils';

describe('to24Hour', () => {
  it('converts 12 AM to 0', () => {
    expect(to24Hour(12, 'AM')).toBe(0);
  });

  it('converts 1-11 AM to 1-11', () => {
    for (let h = 1; h <= 11; h++) {
      expect(to24Hour(h, 'AM')).toBe(h);
    }
  });

  it('converts 12 PM to 12', () => {
    expect(to24Hour(12, 'PM')).toBe(12);
  });

  it('converts 1-11 PM to 13-23', () => {
    for (let h = 1; h <= 11; h++) {
      expect(to24Hour(h, 'PM')).toBe(h + 12);
    }
  });

  it('clamps out-of-range high values (e.g. 25) to 12', () => {
    expect(to24Hour(25, 'AM')).toBe(0); // clamped to 12 AM → 0
    expect(to24Hour(25, 'PM')).toBe(12); // clamped to 12 PM → 12
  });

  it('clamps out-of-range low values (e.g. 0, -1) to 1', () => {
    expect(to24Hour(0, 'AM')).toBe(1); // clamped to 1 AM → 1
    expect(to24Hour(-1, 'PM')).toBe(13); // clamped to 1 PM → 13
  });

  it('rounds fractional values before converting', () => {
    expect(to24Hour(2.7, 'AM')).toBe(3);
    expect(to24Hour(11.4, 'PM')).toBe(23);
  });

  it('falls back to midnight/noon for NaN input', () => {
    expect(to24Hour(NaN, 'AM')).toBe(0);
    expect(to24Hour(NaN, 'PM')).toBe(12);
  });

  it('falls back for Infinity input', () => {
    expect(to24Hour(Infinity, 'AM')).toBe(0);
    expect(to24Hour(-Infinity, 'PM')).toBe(12);
  });
});

describe('to12Hour', () => {
  it('converts 0 (midnight) to 12', () => {
    expect(to12Hour(0)).toBe(12);
  });

  it('converts 1-11 to 1-11', () => {
    for (let h = 1; h <= 11; h++) {
      expect(to12Hour(h)).toBe(h);
    }
  });

  it('converts 12 (noon) to 12', () => {
    expect(to12Hour(12)).toBe(12);
  });

  it('converts 13-23 to 1-11', () => {
    for (let h = 13; h <= 23; h++) {
      expect(to12Hour(h)).toBe(h - 12);
    }
  });

  it('falls back to 12 for NaN input', () => {
    expect(to12Hour(NaN)).toBe(12);
  });
});
