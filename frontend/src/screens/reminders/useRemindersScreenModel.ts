import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useCompleteReminderMutation,
  useDeleteReminderMutation,
  useSkipReminderMutation,
  useUpdateReminderMutation,
} from "@/features/reminders/hooks/useReminderMutations";
import { useRemindersQuery } from "@/features/reminders/hooks/useRemindersQuery";
import type { Reminder } from "@/features/reminders/types";
import {
  groupOpenReminders,
  sortDoneReminders,
} from "@/features/reminders/utils/reminderGroups";
import {
  canPayNow,
  payNow,
  shareNudge,
} from "@/features/reminders/utils/reminderActions";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { useUserSettingsQuery } from "@/features/settings/hooks/useUserSettingsQuery";
import { useToast } from "@/features/toast/useToast";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { triggerConfirmHaptic, triggerHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";

type RemindersNavigation = NativeStackNavigationProp<MainStackParamList, "Reminders">;

/** How long a reminder a notification or Home pointed at stays tinted. */
export const HIGHLIGHT_MS = 3000;

/**
 * The Reminders list: open reminders in sections, finished ones on demand, and every action of a row
 * (mark paid, skip, pay now, nudge, edit, delete, reopen).
 */
export function useRemindersScreenModel() {
  const navigation = useNavigation<RemindersNavigation>();
  const route = useRoute<RouteProp<MainStackParamList, "Reminders">>();
  const { showToast } = useToast();
  const today = useCurrentDay();
  const { userId } = useSessionUserId();
  const settings = useUserSettingsQuery();
  const profile = useCurrentUserProfileQuery(userId);

  const openQuery = useRemindersQuery("open");
  const [doneExpanded, setDoneExpanded] = useState(false);
  const doneQuery = useRemindersQuery("done", { enabled: doneExpanded });

  const sections = useMemo(
    () => groupOpenReminders(openQuery.data ?? [], today),
    [openQuery.data, today],
  );
  const doneItems = useMemo(
    () => sortDoneReminders(doneQuery.data ?? []),
    [doneQuery.data],
  );
  const openCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  // A tap on a notification or on Home's Upcoming card points at one reminder.
  const highlightParam = route.params?.highlightId;
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightParam) {
      return;
    }
    setHighlightedId(highlightParam);
    const timer = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightParam]);

  const { mutateAsync: completeAsync } = useCompleteReminderMutation();
  const { mutateAsync: skipAsync } = useSkipReminderMutation();
  const { mutateAsync: updateAsync } = useUpdateReminderMutation();
  const { mutateAsync: removeAsync } = useDeleteReminderMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Reminder | null>(null);

  /** Runs one row action: marks the row busy, reports a failure, always clears the busy mark. */
  const run = useCallback(
    async (reminder: Reminder, action: () => Promise<string>) => {
      setBusyId(reminder.id);
      try {
        const message = await action();
        void triggerConfirmHaptic();
        showToast({ variant: "success", message });
      } catch (error) {
        showToast({ variant: "error", message: parseFastApiError(error) });
      } finally {
        setBusyId(null);
      }
    },
    [showToast],
  );

  const onAdd = useCallback(() => {
    navigation.navigate("ReminderEditor", {});
  }, [navigation]);

  const onEdit = useCallback(
    (reminder: Reminder) => {
      navigation.navigate("ReminderEditor", { reminder });
    },
    [navigation],
  );

  const onMarkDone = useCallback(
    (reminder: Reminder, transactionId?: string) =>
      run(reminder, async () => {
        await completeAsync({ reminder, transactionId });
        return reminder.direction === "receive" ? "Marked received" : "Marked paid";
      }),
    [completeAsync, run],
  );

  const onSkip = useCallback(
    (reminder: Reminder) =>
      run(reminder, async () => {
        await skipAsync(reminder.id);
        return "Moved to the next date";
      }),
    [run, skipAsync],
  );

  const onReopen = useCallback(
    (reminder: Reminder) =>
      run(reminder, async () => {
        await updateAsync({
          id: reminder.id,
          body: { status: "open" },
        });
        return "Reminder reopened";
      }),
    [run, updateAsync],
  );

  const onDeletePress = useCallback((reminder: Reminder) => {
    void triggerHaptic();
    setPendingDelete(reminder);
  }, []);
  const onDeleteCancel = useCallback(() => setPendingDelete(null), []);
  const onDeleteConfirm = useCallback(async () => {
    const reminder = pendingDelete;
    if (!reminder) {
      return;
    }
    await run(reminder, async () => {
      await removeAsync(reminder.id);
      return "Reminder deleted";
    });
    setPendingDelete(null);
  }, [pendingDelete, removeAsync, run]);

  const onPayNow = useCallback(
    async (reminder: Reminder) => {
      if (!canPayNow(reminder)) {
        showToast({
          variant: "info",
          message: "Add their UPI ID and an amount to pay from here.",
        });
        return;
      }
      const result = await payNow(reminder);
      if (result !== "opened") {
        showToast({ variant: "error", message: "No UPI app found" });
      }
    },
    [showToast],
  );

  const settingsData = settings.data;
  const profileName = profile.data?.username ?? null;
  const onNudge = useCallback(
    async (reminder: Reminder) => {
      const shared = await shareNudge(reminder, {
        level: settingsData?.reportRoastLevel ?? "spicy",
        myUpiId: settingsData?.upiId ?? null,
        myName: profileName,
        today,
      });
      if (!shared) {
        showToast({ variant: "error", message: "Couldn't open the share sheet." });
      }
    },
    [profileName, settingsData?.reportRoastLevel, settingsData?.upiId, showToast, today],
  );

  const toggleDone = useCallback(() => {
    void triggerHaptic();
    setDoneExpanded((expanded) => !expanded);
  }, []);

  const { refetch: refetchOpen } = openQuery;
  const { refetch: refetchDone } = doneQuery;

  return {
    today,
    sections,
    openCount,
    doneItems,
    doneExpanded,
    doneLoading: doneExpanded && doneQuery.isPending,
    doneError: doneExpanded && doneQuery.isError && doneQuery.data === undefined,
    isLoading: openQuery.isPending,
    isError: openQuery.isError && openQuery.data === undefined,
    highlightedId,
    busyId,
    pendingDelete,
    deleting: busyId !== null && pendingDelete?.id === busyId,
    onRetry: () => void refetchOpen(),
    onRetryDone: () => void refetchDone(),
    toggleDone,
    onAdd,
    onEdit,
    onMarkDone: (reminder: Reminder, transactionId?: string) =>
      void onMarkDone(reminder, transactionId),
    onSkip: (reminder: Reminder) => void onSkip(reminder),
    onReopen: (reminder: Reminder) => void onReopen(reminder),
    onPayNow: (reminder: Reminder) => void onPayNow(reminder),
    onNudge: (reminder: Reminder) => void onNudge(reminder),
    onDeletePress,
    onDeleteCancel,
    onDeleteConfirm: () => void onDeleteConfirm(),
  };
}
