import type { LucideIcon } from "lucide-react-native";

/**
 * What a tour or step uses as its icon: a lucide icon, or `"dimeAgent"` for the Dime mark (anything
 * that stands for Dime Agent). The UI turns it into a component (`resolveTourIcon`).
 */
export type TourIconSpec = LucideIcon | "dimeAgent";
