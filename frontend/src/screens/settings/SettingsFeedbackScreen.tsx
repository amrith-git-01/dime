import { SettingsFeedbackEditor } from "@/features/settings/components";

import { useSettingsFeedbackScreenModel } from "./useSettingsFeedbackScreenModel";

export default function SettingsFeedbackScreen() {
  const {
    feedbackType,
    setFeedbackType,
    message,
    setMessage,
    sendDisabled,
    sendLoading,
    onClear,
    onSend,
  } = useSettingsFeedbackScreenModel();

  return (
    <SettingsFeedbackEditor
      feedbackType={feedbackType}
      onFeedbackTypeChange={setFeedbackType}
      message={message}
      onMessageChange={setMessage}
      onClear={onClear}
      onSend={onSend}
      sendDisabled={sendDisabled}
      sendLoading={sendLoading}
    />
  );
}
