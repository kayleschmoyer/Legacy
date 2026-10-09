import React from 'react';
import { DatePicker } from './DatePicker';
import { fireEvent, render } from '../test-utils';

// LS-10486: the native <input type="date"> must show and emit the user's
// local calendar day in every zone, not the UTC day.
describe.each(['Asia/Kolkata', 'America/Los_Angeles'])(
  'DatePicker native input under TZ=%s',
  (zone) => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = zone;
    });
    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    const getInput = (container: HTMLElement) =>
      container.querySelector('input[type="date"]') as HTMLInputElement;

    it('displays the local calendar day of the value', () => {
      const { container } = render(
        <DatePicker value={new Date(2026, 9, 8)} onChange={jest.fn()} />,
      );
      expect(getInput(container).value).toBe('2026-10-08');
    });

    it('emits a Date on the picked local calendar day', () => {
      const onChange = jest.fn();
      const { container } = render(<DatePicker onChange={onChange} />);
      fireEvent.change(getInput(container), {
        target: { value: '2026-10-08' },
      });
      const emitted = (onChange.mock.calls as Date[][])[0][0];
      expect([
        emitted.getFullYear(),
        emitted.getMonth(),
        emitted.getDate(),
      ]).toEqual([2026, 9, 8]);
    });

    it('formats min/max as local calendar days', () => {
      const { container } = render(
        <DatePicker
          onChange={jest.fn()}
          minDate={new Date(2026, 0, 1)}
          maxDate={new Date(2026, 11, 31)}
        />,
      );
      const input = getInput(container);
      expect(input.min).toBe('2026-01-01');
      expect(input.max).toBe('2026-12-31');
    });
  },
);
