import { navigationRef } from "./navigationRef";

/** True once the navigator is ready and the signed-in `Main` stack is the root route. */
export function canNavigateToMain(): boolean {
  if (!navigationRef.isReady()) {
    return false;
  }

  const rootState = navigationRef.getRootState();

  if (!rootState) {
    return false;
  }

  return rootState.routeNames?.includes("Main") ?? false;
}
