import { ReportStatusView, StoryPlayer } from "@/features/brokeReport/components";

import { useBrokeReportScreenModel } from "./useBrokeReportScreenModel";

/** Full-screen Broke Report over the tabs. */
export default function BrokeReportScreen() {
  const model = useBrokeReportScreenModel();

  if (model.status === "ready" && model.snapshot) {
    return (
      <StoryPlayer
        snapshot={model.snapshot}
        level={model.level}
        isSample={model.isSample}
        onClose={model.onClose}
      />
    );
  }

  return (
    <ReportStatusView
      status={model.status === "ready" ? "loading" : model.status}
      onRetry={model.onRetry}
      onClose={model.onClose}
    />
  );
}
