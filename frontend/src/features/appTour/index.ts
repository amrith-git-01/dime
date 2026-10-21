/**
 * Public, non-UI surface of the guided tours, for other features (Settings → Tours, the Get
 * started checklist, the header "?" buttons, the Ask AI chat). The tour's UI is exported from
 * `@/features/appTour/components`.
 */
export { TOUR_COUNT, TOUR_ORDER, TOURS, getTour, tourIdForTab } from "./constants/tourRegistry";
export type { TourIconSpec } from "./constants/tourIcons";
export type { TourDefinition, TourId, TourTab } from "./constants/tourTypes";
export { useFocusedTourTab, useTourProgress } from "./hooks/useTourProgress";
export { isScriptedChatActive, useScriptedChatActive } from "./store/scriptedChat";
export { isAgentEntryFabHiddenByTour } from "./utils/agentFabVisibility";
export { launchTour } from "./utils/launchTour";
export { buildTourRows, toursProgressLabel, type TourRowData } from "./utils/tourRows";
export { openToursSettings } from "./utils/tourNavigation";
