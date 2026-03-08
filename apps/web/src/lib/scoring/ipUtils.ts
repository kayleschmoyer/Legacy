/**
 * Baseball innings-pitched (IP) conversion utilities.
 *
 * IP is stored in "baseball notation" where the decimal digit represents outs,
 * not a fractional inning:
 *   12.0 = 12 innings + 0 outs  = 36 outs total
 *   12.1 = 12 innings + 1 out   = 37 outs total
 *   12.2 = 12 innings + 2 outs  = 38 outs total
 *
 * Treating .1 / .2 as decimal fractions causes wrong ERA and totals.
 */

/**
 * Convert a baseball IP value (e.g. 12.1) to the equivalent integer out count.
 */
export function ipToOuts(ip: number): number {
  const fullInnings = Math.floor(ip);
  const remainingOuts = Math.round((ip - fullInnings) * 10);
  return fullInnings * 3 + remainingOuts;
}

/**
 * Convert a baseball IP value to actual decimal innings (for ratio stats like ERA).
 * e.g. 12.1 → 12.333…
 */
export function ipToDecimalInnings(ip: number): number {
  return ipToOuts(ip) / 3;
}

/**
 * Convert a raw out count to a baseball-notation IP string.
 * e.g. 37 → "12.1", 38 → "12.2", 36 → "12.0"
 */
export function outsToBaseballIP(outs: number): string {
  const fullInnings = Math.floor(outs / 3);
  const remainingOuts = outs % 3;
  return `${fullInnings}.${remainingOuts}`;
}
