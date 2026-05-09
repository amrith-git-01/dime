import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { fontFamilies } from "@/constants/fonts";

const palette = {
  primary: "#6355E8",
  primaryLight: "#7C6EF8",
  primaryMuted: "#EEEDFB",
  background: "#F5F4FF",
  surface: "#FFFFFF",
  surfaceTint: "#FAFAFF",
  textPrimary: "#0A0A1F",
  textSecondary: "#6B6B80",
  borderLight: "#EEEEFF",
  chipBorder: "#E0DFFA",
  success: "#16A34A",
  danger: "#DC2626",
} as const;

const monthOptions = ["May 2026", "Apr 2026", "Mar 2026", "Feb 2026", "Jan 2026"];

type TransactionCategory = {
  name: string;
  emoji: string;
  color: string;
};

type MockTransaction = {
  id: string;
  merchant: string;
  amount: number;
  category: TransactionCategory;
  time: string;
  method: string;
  date: string;
};

type TransactionSection = {
  date: string;
  dailyTotal: number;
  sectionIndex: number;
  data: MockTransaction[];
};

const mockTransactions: MockTransaction[] = [
  {
    id: "1",
    merchant: "Swiggy",
    amount: -329,
    category: { name: "Food", emoji: "\u{1F354}", color: "#FF6B6B" },
    time: "9:41 PM",
    method: "UPI",
    date: "today",
  },
  {
    id: "2",
    merchant: "Uber",
    amount: -188,
    category: { name: "Transport", emoji: "\u{1F697}", color: "#4ECDC4" },
    time: "6:20 PM",
    method: "UPI",
    date: "today",
  },
  {
    id: "3",
    merchant: "Amazon",
    amount: -699,
    category: { name: "Shopping", emoji: "\u{1F6CD}\uFE0F", color: "#A855F7" },
    time: "Card \u00B7 Online",
    method: "",
    date: "yesterday",
  },
  {
    id: "4",
    merchant: "Apollo 24x7",
    amount: -50,
    category: { name: "Health", emoji: "\u{1F48A}", color: "#4ADE80" },
    time: "3:15 PM",
    method: "Cash",
    date: "yesterday",
  },
  {
    id: "5",
    merchant: "BookMyShow",
    amount: -500,
    category: { name: "Entertainment", emoji: "\u{1F3AC}", color: "#FB923C" },
    time: "Card \u00B7 Online",
    method: "",
    date: "Thu, Aug 22",
  },
  {
    id: "6",
    merchant: "Salary - TechCorp",
    amount: 25000,
    category: { name: "Income", emoji: "\u{1F4B0}", color: "#34D399" },
    time: "Bank Transfer",
    method: "",
    date: "Wed, Aug 21",
  },
];

const dateLabelByKey: Record<string, string> = {
  today: "TODAY",
  yesterday: "YESTERDAY",
};

function formatAmount(amount: number) {
  const absolute = Math.abs(amount).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });

  if (amount > 0) {
    return `+\u20B9${absolute}`;
  }

  if (amount < 0) {
    return `-\u20B9${absolute}`;
  }

  return `\u20B9${absolute}`;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function groupTransactions(transactions: MockTransaction[]) {
  const order: string[] = [];
  const grouped = new Map<string, MockTransaction[]>();

  transactions.forEach((transaction) => {
    if (!grouped.has(transaction.date)) {
      order.push(transaction.date);
      grouped.set(transaction.date, []);
    }

    grouped.get(transaction.date)?.push(transaction);
  });

  return order.map((date, sectionIndex) => {
    const data = grouped.get(date) ?? [];
    const dailyTotal = data.reduce((total, transaction) => {
      return total + transaction.amount;
    }, 0);

    return {
      date: dateLabelByKey[date] ?? date.toUpperCase(),
      dailyTotal,
      sectionIndex,
      data,
    };
  });
}

function summarizeTransactions(transactions: MockTransaction[]) {
  return transactions.reduce(
    (summary, transaction) => {
      if (transaction.amount > 0) {
        summary.credited += transaction.amount;
      }

      if (transaction.amount < 0) {
        summary.debited += transaction.amount;
      }

      summary.count += 1;
      return summary;
    },
    { credited: 0, debited: 0, count: 0 },
  );
}

function transactionAnimationOrder(
  sections: TransactionSection[],
  sectionIndex: number,
  rowIndex: number,
) {
  return sections
    .slice(0, sectionIndex)
    .reduce((total, section) => total + section.data.length, rowIndex);
}


type TransactionsHeroCardProps = {
  selectedMonth: string;
  monthMenuOpen: boolean;
  summary: {
    credited: number;
    debited: number;
    count: number;
  };
  onToggleMonthMenu: () => void;
  onSelectMonth: (month: string) => void;
};

const TransactionsHeroCard = memo(function TransactionsHeroCard({
  selectedMonth,
  monthMenuOpen,
  summary,
  onToggleMonthMenu,
  onSelectMonth,
}: TransactionsHeroCardProps) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroBubbleLarge} />
      <View style={styles.heroBubbleSmall} />

      <View style={styles.heroHeader}>
        <View style={styles.heroTitleBlock}>
          <Text style={styles.heroKicker}>Total Transactions</Text>
          <Text style={styles.heroTitle}>{summary.count} transactions</Text>
        </View>

        <View style={styles.monthDropdownWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={onToggleMonthMenu}
            style={({ pressed }) => [
              styles.monthButton,
              pressed && styles.monthButtonPressed,
            ]}
          >
            <Text style={styles.monthButtonText}>{selectedMonth}</Text>
            <Text style={styles.monthChevron}>{monthMenuOpen ? "\u2303" : "\u2304"}</Text>
          </Pressable>

          {monthMenuOpen ? (
            <View style={styles.monthMenu}>
              {monthOptions.map((month) => (
                <Pressable
                  key={month}
                  accessibilityRole="button"
                  onPress={() => onSelectMonth(month)}
                  style={({ pressed }) => [
                    styles.monthMenuItem,
                    selectedMonth === month && styles.monthMenuItemActive,
                    pressed && styles.monthMenuItemPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.monthMenuText,
                      selectedMonth === month && styles.monthMenuTextActive,
                    ]}
                  >
                    {month}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.heroStatsGrid}>
        <View style={styles.heroStatCard}>
          <Text style={styles.heroStatLabel}>Credited</Text>
          <Text style={[styles.heroStatValue, styles.heroCreditValue]}>
            {formatAmount(summary.credited)}
          </Text>
        </View>

        <View style={styles.heroStatCard}>
          <Text style={styles.heroStatLabel}>Debited</Text>
          <Text style={[styles.heroStatValue, styles.heroDebitValue]}>
            {formatAmount(summary.debited)}
          </Text>
        </View>
      </View>
    </View>
  );
});


type DateHeaderProps = {
  section: TransactionSection;
  sectionIndex: number;
};

const DateHeader = memo(function DateHeader({
  section,
  sectionIndex,
}: DateHeaderProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        delay: sectionIndex === 0 ? 100 : 0,
        useNativeDriver: false,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        delay: sectionIndex === 0 ? 100 : 0,
        useNativeDriver: false,
      }),
    ]).start();
  }, [opacity, sectionIndex, translateY]);

  return (
    <Animated.View
      style={[
        styles.dateHeader,
        sectionIndex === 0 && styles.firstDateHeader,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.dateLabel}>{section.date}</Text>
      <View style={styles.dateLine} />
      <Text
        style={[
          styles.dailyTotal,
          section.dailyTotal >= 0 ? styles.positiveAmount : styles.negativeTotal,
        ]}
        numberOfLines={1}
      >
        {formatAmount(section.dailyTotal)}
      </Text>
    </Animated.View>
  );
});

type CategoryIconProps = {
  category: TransactionCategory;
};

const CategoryIcon = memo(function CategoryIcon({ category }: CategoryIconProps) {
  return (
    <View
      style={[
        styles.categoryIcon,
        { backgroundColor: hexToRgba(category.color, 0.1) },
      ]}
    >
      <Text style={styles.categoryEmoji}>{category.emoji}</Text>
    </View>
  );
});

type TransactionRowProps = {
  transaction: MockTransaction;
  rowIndex: number;
  animationOrder: number;
};

const TransactionRow = memo(function TransactionRow({
  transaction,
  rowIndex,
  animationOrder,
}: TransactionRowProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const pressProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        delay: 150 + animationOrder * 40,
        useNativeDriver: false,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        delay: 150 + animationOrder * 40,
        useNativeDriver: false,
      }),
    ]).start();
  }, [animationOrder, opacity, translateY]);

  const rowBackground = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      rowIndex % 2 === 0 ? palette.surface : palette.surfaceTint,
      palette.primaryMuted,
    ],
  });

  const animatePressed = (pressed: boolean) => {
    Animated.parallel([
      Animated.timing(pressProgress, {
        toValue: pressed ? 1 : 0,
        duration: 100,
        useNativeDriver: false,
      }),
      Animated.spring(scale, {
        toValue: pressed ? 0.98 : 1,
        useNativeDriver: false,
        speed: 28,
        bounciness: pressed ? 0 : 8,
      }),
    ]).start();
  };

  const detail = [transaction.time, transaction.method].filter(Boolean).join(" \u00B7 ");

  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={() => animatePressed(true)}
      onPressOut={() => animatePressed(false)}
    >
      <Animated.View
        style={[
          styles.transactionRow,
          {
            backgroundColor: rowBackground,
            opacity,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <CategoryIcon category={transaction.category} />

        <View style={styles.transactionBody}>
          <Text
            style={styles.merchantName}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {transaction.merchant}
          </Text>
          <Text style={styles.transactionMeta} numberOfLines={1}>
            {detail}
          </Text>
        </View>

        <Text
          style={[
            styles.transactionAmount,
            transaction.amount > 0 && styles.positiveAmount,
          ]}
          numberOfLines={1}
        >
          {formatAmount(transaction.amount)}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

export default function TransactionsScreen() {
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);

  const sections = useMemo(() => {
    return groupTransactions(mockTransactions);
  }, []);

  const summary = useMemo(() => {
    return summarizeTransactions(mockTransactions);
  }, []);

  const handleSelectMonth = (month: string) => {
    setSelectedMonth(month);
    setMonthMenuOpen(false);
  };

  return (
    <TabScreenShell>
      <View style={styles.screen}>

        {/* SectionList gives native section headers while keeping row rendering virtualized. */}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => {
            return (
              <DateHeader
                section={section}
                sectionIndex={section.sectionIndex}
              />
            );
          }}
          renderItem={({ item, index, section }) => {
            return (
              <TransactionRow
                transaction={item}
                rowIndex={index}
                animationOrder={transactionAnimationOrder(
                  sections,
                  section.sectionIndex,
                  index,
                )}
              />
            );
          }}
          ListHeaderComponent={
            <TransactionsHeroCard
              selectedMonth={selectedMonth}
              monthMenuOpen={monthMenuOpen}
              summary={summary}
              onToggleMonthMenu={() => setMonthMenuOpen((open) => !open)}
              onSelectMonth={handleSelectMonth}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No transactions here</Text>
              <Text style={styles.emptyText}>No transactions are available for this period.</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          initialNumToRender={15}
          removeClippedSubviews
        />
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  heroCard: {
    position: "relative",
    overflow: "visible",
    marginTop: 16,
    marginBottom: 16,
    padding: 24,
    borderRadius: 22,
    backgroundColor: palette.primary,
    borderWidth: 1,
    borderColor: palette.primaryLight,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 7,
    zIndex: 3,
  },
  heroBubbleLarge: {
    position: "absolute",
    top: -52,
    right: -42,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  heroBubbleSmall: {
    position: "absolute",
    right: 28,
    bottom: -72,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroHeader: {
    zIndex: 2,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: palette.surface,
  },
  heroTitle: {
    marginTop: 4,
    fontFamily: fontFamilies.semiBold,
    fontSize: 28,
    lineHeight: 36,
    color: palette.surface,
  },
  monthDropdownWrap: {
    position: "relative",
    zIndex: 5,
  },
  monthButton: {
    minWidth: 104,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  monthButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  monthButtonText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.88)",
  },
  monthChevron: {
    marginTop: -1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 16,
    color: palette.surface,
  },
  monthMenu: {
    position: "absolute",
    top: 42,
    right: 0,
    width: 116,
    padding: 4,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.chipBorder,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  monthMenuItem: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  monthMenuItemActive: {
    backgroundColor: palette.primaryMuted,
  },
  monthMenuItemPressed: {
    backgroundColor: palette.borderLight,
  },
  monthMenuText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textSecondary,
  },
  monthMenuTextActive: {
    color: palette.primary,
  },
  heroStatsGrid: {
    zIndex: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
  },
  heroStatCard: {
    flex: 1,
    minHeight: 72,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroStatLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255,255,255,0.72)",
  },
  heroStatValue: {
    marginTop: 4,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: palette.surface,
  },
  heroCreditValue: {
    color: "#BBF7D0",
  },
  heroDebitValue: {
    color: "#FECACA",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    marginBottom: 12,
  },
  firstDateHeader: {
    marginTop: 12,
  },
  dateLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textSecondary,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.borderLight,
  },
  dailyTotal: {
    minWidth: 82,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 18,
    textAlign: "right",
  },
  negativeTotal: {
    color: palette.danger,
  },
  transactionRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  categoryEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  transactionBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  merchantName: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 20,
    color: palette.textPrimary,
  },
  transactionMeta: {
    marginTop: 2,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textSecondary,
  },
  transactionAmount: {
    width: 96,
    flexShrink: 0,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 16,
    lineHeight: 20,
    color: palette.textPrimary,
    textAlign: "right",
  },
  positiveAmount: {
    color: palette.success,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 96,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: palette.textPrimary,
  },
  emptyText: {
    marginTop: 8,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
    textAlign: "center",
  },
});
