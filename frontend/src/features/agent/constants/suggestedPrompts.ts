import type { LucideIcon } from "lucide-react-native";
import {
  ArrowLeftRight,
  BarChart2,
  CalendarRange,
  LayoutGrid,
  Store,
  Target,
  TrendingDown,
  UtensilsCrossed,
} from "lucide-react-native";

export const AGENT_SUGGESTED_PROMPTS = [
  "How much did I spend this month?",
  "Am I over my monthly budget?",
  "Top spending categories this month",
  "Compare this month vs last month",
  "Show my daily spending last 40 days",
  "Where did I spend the most last month?",
  "How much did I spend on food this month?",
  "Compare this year vs last year",
] as const;

export type AgentSuggestedPromptMeta = {
  prompt: string;
  icon: LucideIcon;
};

export const AGENT_SUGGESTED_PROMPT_META: readonly AgentSuggestedPromptMeta[] =
  [
    { prompt: "How much did I spend this month?", icon: TrendingDown },
    { prompt: "Am I over my monthly budget?", icon: Target },
    { prompt: "Top spending categories this month", icon: LayoutGrid },
    { prompt: "Compare this month vs last month", icon: ArrowLeftRight },
    { prompt: "Show my daily spending last 40 days", icon: BarChart2 },
    { prompt: "Where did I spend the most last month?", icon: Store },
    { prompt: "How much did I spend on food this month?", icon: UtensilsCrossed },
    { prompt: "Compare this year vs last year", icon: CalendarRange },
  ];
