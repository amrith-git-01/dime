import type { ComponentType } from "react";

import {
  StackScreenShell,
  type StackScreenShellProps,
} from "@/components/layout/StackScreenShell";

type StackShellConfig = Omit<StackScreenShellProps, "children">;

export function withStackScreen<P extends object>(
  Screen: ComponentType<P>,
  shellConfig?: StackShellConfig,
): ComponentType<P> {
  function StackScreenHost(props: P) {
    return (
      <StackScreenShell {...shellConfig}>
        <Screen {...props} />
      </StackScreenShell>
    );
  }

  StackScreenHost.displayName = `StackScreen(${
    Screen.displayName ?? Screen.name ?? "Component"
  })`;

  return StackScreenHost;
}
