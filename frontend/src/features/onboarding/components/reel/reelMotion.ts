/**
 * The clock-driven animation helpers moved to `@/utils/clockMotion` (the Broke Report story player
 * uses them too); the reel scenes keep importing them from here.
 */
export {
  easeIn,
  easeInOut,
  easeOut,
  easeOutBack,
  lerp,
  seg,
} from "@/utils/clockMotion";
