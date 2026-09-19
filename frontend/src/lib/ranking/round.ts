// Mirrors EloRankScoreCalculator's private `round(double)`:
//   BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue()
//
// BigDecimal.valueOf(double) is specified as `new BigDecimal(Double.toString(value))` - i.e. it
// rounds from the *shortest round-trippable decimal string* representation of the IEEE-754
// double, not from the double's exact binary value. JS's default Number->String conversion
// (`value.toString()`) is specified (ECMA-262) to produce that same shortest round-trip decimal
// string, so working from `.toString()` here - rather than naive `value * 100` float math, which
// can misround cases like 2.675 - tracks Java's behavior rather than diverging from it.
//
// RoundingMode.HALF_UP rounds an exact-.5 case away from zero regardless of sign (not "toward
// positive infinity") - handled here by rounding the sign-stripped magnitude, then reapplying it.

export function round2(value: number): number {
  const str = value.toString();
  if (str.includes('e') || str.includes('E')) {
    // Not expected for the magnitudes this domain deals with (rank scores, Elo deltas); fall
    // back to a plain numeric round rather than parsing exponential notation.
    return Math.round(value * 100) / 100;
  }

  const negative = str.startsWith('-');
  const abs = negative ? str.slice(1) : str;
  const [intPart, fracPart = ''] = abs.split('.');
  const threeDigits = (fracPart + '000').slice(0, 3);
  const twoDigits = threeDigits.slice(0, 2);
  const thirdDigit = threeDigits.charCodeAt(2) - 48;

  let cents = Number(intPart) * 100 + Number(twoDigits);
  if (thirdDigit >= 5) cents += 1;

  const result = cents / 100;
  return negative && result !== 0 ? -result : result;
}
