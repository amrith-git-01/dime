import { dimeApi } from "@/lib/api/dimeApi";

import type { OnboardingProgress } from "../types";

export async function fetchOnboardingProgress(): Promise<OnboardingProgress> {
  const { data } = await dimeApi.get<OnboardingProgress>(
    "/api/v1/me/onboarding-progress",
  );
  return data;
}
