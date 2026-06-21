import { memo, useMemo } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";

import { accent, ink, surface } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { parseAgentProse } from "@/features/agent/utils/parseAgentProse";

type AgentMessageProseProps = {
  content: string;
  variant: "user" | "assistant";
};

export const AgentMessageProse = memo(function AgentMessageProse({
  content,
  variant,
}: AgentMessageProseProps) {
  const tokens = useMemo(() => parseAgentProse(content), [content]);
  const isUser = variant === "user";

  const baseStyle: TextStyle = {
    ...styles.prose,
    color: isUser ? surface : ink,
  };

  const numberStyle: TextStyle = isUser
    ? styles.numberUser
    : styles.numberAssistant;

  return (
    <Text style={baseStyle}>
      {tokens.map((token, index) => {
        const key = `${token.type}-${index}-${token.value.slice(0, 12)}`;

        switch (token.type) {
          case "bold":
            return (
              <Text key={key} style={styles.bold}>
                {token.value}
              </Text>
            );
          case "number":
            return (
              <Text
                key={key}
                style={[numberStyle, isUser && styles.numberOnUser]}
              >
                {token.value}
              </Text>
            );
          case "bold_number":
            return (
              <Text
                key={key}
                style={[
                  styles.bold,
                  numberStyle,
                  isUser && styles.numberOnUser,
                ]}
              >
                {token.value}
              </Text>
            );
          default:
            return token.value;
        }
      })}
    </Text>
  );
});

const styles = StyleSheet.create({
  prose: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  bold: {
    fontFamily: fontFamilies.semiBold,
  },
  numberAssistant: {
    fontFamily: fontFamilies.monoSemiBold,
    color: accent,
  },
  numberUser: {
    fontFamily: fontFamilies.monoSemiBold,
    color: surface,
  },
  numberOnUser: {},
});
