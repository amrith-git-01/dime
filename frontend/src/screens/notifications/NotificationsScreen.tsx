import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Bell } from "lucide-react-native";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { NotificationBentoRow } from "@/components/notifications/NotificationBentoRow";
import { NotificationsFilterTabs } from "@/components/notifications/NotificationsFilterTabs";
import { SettingsSection } from "@/features/settings/components";
import { TwoToneEmptyState } from "@/components/shared";
import { useNotificationsFeed } from "@/features/notifications/hooks/useNotificationsFeed";
import type { AppNotification } from "@/features/notifications/types";
import { useToast } from "@/features/toast/useToast";
import type { MainStackParamList } from "@/navigation/types";

import {
  NOTIFICATION_FILTER_EMPTY,
  NOTIFICATION_INBOX_EMPTY,
} from "./notificationEmptyCopy";

export default function NotificationsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { showToast } = useToast();
  const {
    filter,
    setFilter,
    groups,
    isInboxEmpty,
    isFilterEmpty,
    markRead,
    isUnread,
  } = useNotificationsFeed();

  const handlePress = useCallback(
    (notification: AppNotification) => {
      markRead(notification.id);

      switch (notification.action.type) {
        case "home":
          navigation.goBack();
          break;
        case "manual_add":
          navigation.navigate("ManualAddTransaction");
          break;
        case "transaction_detail":
          showToast({
            variant: "success",
            message: "Transaction detail will open when inbox is wired up",
          });
          break;
        case "none":
          break;
        default:
          break;
      }
    },
    [markRead, navigation, showToast],
  );

  if (isInboxEmpty) {
    return (
      <TwoToneEmptyState
        layout="centered"
        icon={Bell}
        {...NOTIFICATION_INBOX_EMPTY}
      />
    );
  }

  return (
    <View style={styles.root}>
      <NotificationsFilterTabs value={filter} onChange={setFilter} />

      {isFilterEmpty ? (
        <View style={styles.filterEmptyWrap}>
          <TwoToneEmptyState
            layout="centered"
            icon={Bell}
            {...NOTIFICATION_FILTER_EMPTY[filter]}
          />
        </View>
      ) : (
        <View style={styles.sections}>
          {groups.map((group) => (
            <SettingsSection key={group.key} title={group.title}>
              {group.items.map((item, index) => (
                <NotificationBentoRow
                  key={item.id}
                  notification={item}
                  unread={isUnread(item)}
                  onPress={handlePress}
                  showSeparator={index < group.items.length - 1}
                />
              ))}
            </SettingsSection>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    gap: BENTO_SECTION_GAP,
  },
  sections: {
    gap: BENTO_SECTION_GAP,
  },
  filterEmptyWrap: {
    flexGrow: 1,
    justifyContent: "center",
  },
});
