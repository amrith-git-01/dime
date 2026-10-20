import { createMMKV } from "react-native-mmkv";

/** Device-level, like the Celebrations preference: not wiped on sign-out. */
const celebrationsMmkv = createMMKV({ id: "dime-onboarding" });

const LAST_CONFETTI_DAY_KEY = "celebrations.last_confetti_day";

/** The local calendar day (`YYYY-MM-DD`) of the last big confetti, if any. */
export function getLastConfettiDay(): string | undefined {
  return celebrationsMmkv.getString(LAST_CONFETTI_DAY_KEY);
}

export function setLastConfettiDay(day: string): void {
  celebrationsMmkv.set(LAST_CONFETTI_DAY_KEY, day);
}

/** Today in the device's timezone as `YYYY-MM-DD`. */
export function localDayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
