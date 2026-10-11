import { RecurringListContent } from "@/features/recurring/components";

import { useRecurringListScreenModel } from "./useRecurringListScreenModel";

export default function RecurringListScreen() {
  const model = useRecurringListScreenModel();

  return <RecurringListContent {...model} />;
}
