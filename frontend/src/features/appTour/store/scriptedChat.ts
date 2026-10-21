import { getTour } from "../constants/tourRegistry";

import { useAppTourStore } from "./appTourStore";

type TourStateSlice = { active: boolean; tourId: Parameters<typeof getTour>[0] };

function scriptedChatOn(state: TourStateSlice): boolean {
  return state.active && getTour(state.tourId).scriptedChat === true;
}

/** True while a tour that shows a scripted Ask AI conversation (no model call, no usage) is running. */
export function useScriptedChatActive(): boolean {
  return useAppTourStore(scriptedChatOn);
}

/** The same, read at the moment of a call (a send handler), never in render. */
export function isScriptedChatActive(): boolean {
  return scriptedChatOn(useAppTourStore.getState());
}
