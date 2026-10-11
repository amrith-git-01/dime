/** Money formatting for the agent: Indian digit grouping, and money fields that carry both forms. */

/** "1,23,456" from a digit string: the last three digits, then groups of two. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${digits.slice(-3)}`;
}

/** "₹1,23,456" / "₹1,23,456.50" (whole amounts drop ".00"); negative values keep a leading "-". */
export function formatInr(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const whole = groupIndian(String(Math.floor(cents / 100)));
  const frac = cents % 100;
  return `${value < 0 && cents > 0 ? '-' : ''}₹${whole}${frac === 0 ? '' : `.${String(frac).padStart(2, '0')}`}`;
}
