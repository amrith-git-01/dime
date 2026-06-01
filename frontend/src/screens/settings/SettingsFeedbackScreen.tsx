import { useCallback, useMemo, useState } from "react";

import { SettingsFeedbackEditor } from "@/features/settings/components";
import { useToast } from "@/features/toast/useToast";

export default function SettingsFeedbackScreen() {
  const { showToast } = useToast();
  const [message, setMessage] = useState("");

  const sendDisabled = useMemo(() => message.trim().length < 8, [message]);

  const handleClear = useCallback(() => {
    setMessage("");
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (trimmed.length < 8) return;

    showToast({
      variant: "success",
      message: "Thanks — feedback isn’t wired to the server yet.",
    });
    setMessage("");
  }, [message, showToast]);

  return (
    <SettingsFeedbackEditor
      message={message}
      onMessageChange={setMessage}
      onClear={handleClear}
      onSend={handleSend}
      sendDisabled={sendDisabled}
    />
  );
}
