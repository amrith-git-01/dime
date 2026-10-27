/**
 * The app-state hooks moved to `@/hooks/useAppEnvironment` (the Broke Report story player uses them
 * too); the reel keeps importing them from here.
 */
export {
  isForegroundState,
  useAppIsActive,
  useScreenReaderEnabled,
} from "@/hooks/useAppEnvironment";
