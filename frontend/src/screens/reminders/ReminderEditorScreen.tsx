import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { ReminderEditor } from "@/features/reminders/components/ReminderEditor";
import type { MainStackParamList } from "@/navigation/types";

type ReminderEditorRoute = RouteProp<MainStackParamList, "ReminderEditor">;

/** Add / edit a reminder (opened from the Reminders list, Home's Upcoming card or Budgets). */
export default function ReminderEditorScreen() {
  const { params } = useRoute<ReminderEditorRoute>();
  const navigation = useNavigation();

  return <ReminderEditor reminder={params?.reminder} onDone={navigation.goBack} />;
}
