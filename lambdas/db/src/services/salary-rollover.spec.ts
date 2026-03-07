import { applyDecay, applyEscalation } from './salary-rollover';

describe('salary-rollover helpers', () => {
  describe('applyEscalation', () => {
    it('applies 10% escalation and rounds up (spec example)', () => {
      // From the design spec: $10 → $11 → $13 → $15 → $17…
      expect(applyEscalation(10, 10)).toBe(11);
      expect(applyEscalation(11, 10)).toBe(13); // 12.1 → ceil → 13
      expect(applyEscalation(13, 10)).toBe(15); // 14.3 → ceil → 15
      expect(applyEscalation(15, 10)).toBe(17); // 16.5 → ceil → 17
    });

    it('rounds up fractional results (ceiling)', () => {
      // $9 * 1.10 = $9.90 → ceil → $10
      expect(applyEscalation(9, 10)).toBe(10);
      // $7 * 1.10 = $7.70 → ceil → $8
      expect(applyEscalation(7, 10)).toBe(8);
    });

    it('handles 0% escalation (salary unchanged)', () => {
      expect(applyEscalation(50, 0)).toBe(50);
    });

    it('handles large escalation percentages', () => {
      // $100 * 1.50 = $150
      expect(applyEscalation(100, 50)).toBe(150);
    });

    it('handles a $1 salary with 10% escalation (ceil of 1.1 = 2)', () => {
      expect(applyEscalation(1, 10)).toBe(2);
    });
  });

  describe('applyDecay', () => {
    it('applies 25% decay and floors (spec example chain)', () => {
      // From the design spec: $40 → $30 → $22 → $16 → $12 → $9 → $6 → $4 → $3 → $2 → $1
      expect(applyDecay(40, 25, 1)).toBe(30); // 40 * 0.75 = 30.00
      expect(applyDecay(30, 25, 1)).toBe(22); // 30 * 0.75 = 22.50 → floor → 22
      expect(applyDecay(22, 25, 1)).toBe(16); // 22 * 0.75 = 16.50 → floor → 16
      expect(applyDecay(16, 25, 1)).toBe(12); // 16 * 0.75 = 12.00
      expect(applyDecay(12, 25, 1)).toBe(9); // 12 * 0.75 = 9.00
      expect(applyDecay(9, 25, 1)).toBe(6); // 9  * 0.75 = 6.75  → floor → 6
      expect(applyDecay(6, 25, 1)).toBe(4); // 6  * 0.75 = 4.50  → floor → 4
      expect(applyDecay(4, 25, 1)).toBe(3); // 4  * 0.75 = 3.00
      expect(applyDecay(3, 25, 1)).toBe(2); // 3  * 0.75 = 2.25  → floor → 2
      expect(applyDecay(2, 25, 1)).toBe(1); // 2  * 0.75 = 1.50  → floor → 1 (at floor)
      expect(applyDecay(1, 25, 1)).toBe(1); // 1  * 0.75 = 0.75  → floor → 0 → max(1, 0) = 1
    });

    it('never goes below minSalary', () => {
      expect(applyDecay(1, 25, 1)).toBe(1);
      expect(applyDecay(2, 99, 1)).toBe(1);
      expect(applyDecay(100, 100, 5)).toBe(5);
    });

    it('handles 0% decay (salary unchanged)', () => {
      expect(applyDecay(50, 0, 1)).toBe(50);
    });

    it('handles custom minSalary floors', () => {
      // salary would decay to 3 but minSalary=5 → returns 5
      expect(applyDecay(4, 25, 5)).toBe(5);
    });
  });
});
