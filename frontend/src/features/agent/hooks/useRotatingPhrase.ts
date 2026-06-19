import { useEffect, useState } from "react";

const DEFAULT_INTERVAL_MS = 2400;

function pickRandomIndex(length: number, exclude?: number): number {
  if (length <= 1) {
    return 0;
  }
  let next = Math.floor(Math.random() * length);
  while (next === exclude) {
    next = Math.floor(Math.random() * length);
  }
  return next;
}

export function useRotatingPhrase(
  phrases: readonly string[],
  active: boolean,
  intervalMs = DEFAULT_INTERVAL_MS,
): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active || phrases.length === 0) {
      return;
    }
    setIndex(pickRandomIndex(phrases.length));
    const timer = setInterval(() => {
      setIndex((prev) => pickRandomIndex(phrases.length, prev));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, phrases, intervalMs]);

  if (phrases.length === 0) {
    return "";
  }
  return phrases[index] ?? phrases[0];
}
