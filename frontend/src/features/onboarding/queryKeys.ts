export const onboardingQueryKeys = {
  all: ["onboardingProgress"] as const,
  progress: (userId: string | undefined) =>
    [...onboardingQueryKeys.all, userId ?? "none"] as const,
};
