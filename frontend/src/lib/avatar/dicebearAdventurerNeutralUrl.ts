export function dicebearAdventurerNeutralUrl(seed: string): string {
  const q = encodeURIComponent(seed);
  return `https://api.dicebear.com/7.x/adventurer-neutral/png?seed=${q}&size=256`;
}
