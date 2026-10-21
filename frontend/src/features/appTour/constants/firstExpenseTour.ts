import { Compass, PencilLine, Plus, Sparkles, Wallet } from "lucide-react-native";

import { tourTargetIds } from "@/constants/tourTargetIds";

import type { TourDefinition } from "./tourTypes";

/**
 * The first-run tour: four short steps ending in a real first expense. It starts by itself for a
 * new user and can be replayed from Settings → Tours.
 */
export const firstExpenseTour: TourDefinition = {
  id: "firstExpense",
  title: "Log your first expense",
  summary: "Add something you spent, step by step",
  icon: Compass,
  durationLabel: "~20 s",
  tab: "Home",
  ownsAllTabs: true,
  autoStart: true,
  steps: [
    {
      id: "welcome",
      kind: "welcome",
      icon: Sparkles,
      title: "Welcome to Dime",
      body: "Let's log your first expense — about 20 seconds.",
      placement: "auto",
      shape: "rounded",
      padding: 0,
      enter: ["closeFab"],
      primaryLabel: "Start",
      skipLabel: "Not now",
      backExits: true,
    },
    {
      id: "addFab",
      kind: "do",
      targetId: tourTargetIds.addFab,
      icon: Plus,
      title: "Add what you spent",
      body: "Tap + to add something you spent today.",
      retryBody: "No worries — tap + whenever you're ready.",
      placement: "above",
      shape: "circle",
      padding: 10,
      holdFab: true,
      enter: ["closeFab"],
      advanceOn: "fabOpened",
      action: "openFab",
      actionLabel: "Open the + menu",
      hint: "Try it: tap the glowing button",
    },
    {
      id: "fabManual",
      kind: "do",
      targetId: tourTargetIds.fabManual,
      icon: PencilLine,
      title: "Add it by hand",
      body: "Tap the pencil and type it in. The camera and mic bubbles scan receipts and take voice.",
      placement: "above",
      shape: "circle",
      padding: 8,
      holdFab: true,
      enter: ["openFab"],
      advanceOn: "transactionSaved",
      action: "openManualAdd",
      actionLabel: "Add it by hand",
      hint: "Try it: tap the glowing button",
    },
    {
      id: "homeRecent",
      kind: "watch",
      // The month card, not the Recent list: it is always above the fold and shows the new total.
      targetId: tourTargetIds.homeMonthCard,
      icon: Wallet,
      title: "You've started tracking!",
      body: "Done! Your month total and budget update instantly.",
      placement: "auto",
      shape: "rounded",
      radius: 24,
      padding: 4,
      enter: ["closeFab"],
      primaryLabel: "Got it",
      backExits: true,
    },
    {
      id: "finale",
      kind: "finale",
      title: "You're all set",
      body: "Tap ? on any screen for a quick tour of it.",
      placement: "auto",
      shape: "rounded",
      padding: 0,
      primaryLabel: "Finish",
    },
  ],
};
