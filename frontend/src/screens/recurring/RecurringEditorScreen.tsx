import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { RecurringEditor } from "@/features/recurring/components";
import type { MainStackParamList } from "@/navigation/types";

type RecurringEditorRoute = RouteProp<MainStackParamList, "RecurringEditor">;

/** Add / edit a recurring income or subscription (opened from the Budgets tab Recurring section). */
export default function RecurringEditorScreen() {
  const { params } = useRoute<RecurringEditorRoute>();
  const navigation = useNavigation();

  return (
    <RecurringEditor
      kind={params.kind}
      item={params.item}
      onDone={navigation.goBack}
    />
  );
}
