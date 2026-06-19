/** Share is 0–1 from API; one decimal avoids rounded labels summing past 100%. */
export function formatPayeeShare(share: number): string {
  const pct = share * 100;
  if (!Number.isFinite(pct) || pct <= 0) {
    return "0%";
  }
  if (pct < 0.05) {
    return "<0.1%";
  }
  return `${pct.toFixed(1)}%`;
}
