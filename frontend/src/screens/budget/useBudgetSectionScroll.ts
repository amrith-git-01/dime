import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useState, type RefObject } from "react";
import type { LayoutChangeEvent } from "react-native";

import type { BudgetsScrollTarget, MainTabParamList } from "@/navigation/types";

/** How long a request keeps following its section's y (the month reset can move the cards). */
const FOLLOW_LAYOUT_MS = 800;

/** The Budgets scroll view (anything that can scroll to a y offset). */
type ScrollableList = {
  scrollTo: (params: { y: number; animated?: boolean }) => void;
};

type BudgetsRoute = RouteProp<MainTabParamList, "Budgets">;

const SECTION_BY_CARD: Record<string, BudgetsScrollTarget | undefined> = {
  "budgets.recurring": "recurring",
  "budgets.categories": "categories",
};

/**
 * Scrolls the Budgets tab to a section when another screen sent the user here (`scrollTo` route
 * param, or the older `recurringKind` which means "recurring"). Each section's y comes from the
 * layout of its card (so it follows the user's Arrange order); the scroll happens once the
 * requested section has been measured (following it briefly while the cards settle); the param is
 * cleared on arrival so the next visit scrolls again.
 * `showCurrentMonth` puts the month selection back on the current month so the numbers match Home.
 */
export function useBudgetSectionScroll(
  listRef: RefObject<ScrollableList | null>,
  showCurrentMonth: () => void,
) {
  const route = useRoute<BudgetsRoute>();
  const navigation = useNavigation();
  const [sectionY, setSectionY] = useState<Partial<Record<BudgetsScrollTarget, number>>>({});

  // Fed the layout of every card, whose y is measured in the scroll content.
  const onCardLayout = useCallback((cardId: string, event: LayoutChangeEvent) => {
    const section = SECTION_BY_CARD[cardId];
    if (!section) {
      return;
    }
    const y = event.nativeEvent.layout.y;
    setSectionY((prev) => (prev[section] === y ? prev : { ...prev, [section]: y }));
  }, []);

  const requested: BudgetsScrollTarget | undefined =
    route.params?.scrollTo ?? (route.params?.recurringKind ? "recurring" : undefined);
  // The request being served. The route param is cleared at once (so a missing card can never leave
  // it stuck, and the next visit scrolls again); the target then follows its section's y for a short
  // while, since the y measured on an earlier visit can move once the month reset re-lays the cards.
  const [pending, setPending] = useState<BudgetsScrollTarget | null>(null);

  useEffect(() => {
    if (!requested) {
      return;
    }
    setPending(requested);
    showCurrentMonth();
    navigation.setParams({ recurringKind: undefined, scrollTo: undefined } as never);
  }, [navigation, requested, showCurrentMonth]);

  useEffect(() => {
    if (!pending) {
      return;
    }
    const timer = setTimeout(() => setPending(null), FOLLOW_LAYOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const pendingY = pending ? sectionY[pending] : undefined;
  useEffect(() => {
    if (pendingY === undefined) {
      return;
    }
    listRef.current?.scrollTo({ y: pendingY, animated: true });
  }, [listRef, pendingY]);

  return { onCardLayout };
}
