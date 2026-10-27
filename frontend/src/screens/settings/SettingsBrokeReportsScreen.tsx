import { ReportsListEditor } from "@/features/brokeReport/components";

import { useSettingsBrokeReportsScreenModel } from "./useSettingsBrokeReportsScreenModel";

export default function SettingsBrokeReportsScreen() {
  const model = useSettingsBrokeReportsScreenModel();
  return <ReportsListEditor {...model} />;
}
