import { isConsentRequiredRegion } from './consentRegion';

describe('isConsentRequiredRegion (LS-10764)', () => {
  it.each([
    'Europe/Berlin',
    'Europe/London',
    'Europe/Zurich',
    'Europe/Dublin',
    'Atlantic/Canary',
    'Atlantic/Reykjavik',
    'Asia/Nicosia',
    'Indian/Reunion',
  ])('requires consent in EU/EEA/UK/CH zone %s', (tz) => {
    expect(isConsentRequiredRegion(tz)).toBe(true);
  });

  it.each(['America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'])(
    'does not require consent in %s',
    (tz) => {
      expect(isConsentRequiredRegion(tz)).toBe(false);
    },
  );

  it.each(['UTC', 'Etc/UTC', 'Etc/GMT+3', 'GMT'])(
    'treats location-less zone %s as requiring consent',
    (tz) => {
      expect(isConsentRequiredRegion(tz)).toBe(true);
    },
  );

  it('treats an unknown zone as requiring consent', () => {
    expect(isConsentRequiredRegion('')).toBe(true);
  });

  it('reads the browser time zone by default', () => {
    const spy = jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({
        timeZone: 'America/Chicago',
      } as Intl.ResolvedDateTimeFormatOptions);
    expect(isConsentRequiredRegion()).toBe(false);
    spy.mockRestore();
  });
});
