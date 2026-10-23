import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void> | void;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const mounted: { unmount: () => void }[] = [];

// Query notifications are batched on a timer: let the last one land inside `act`, then unmount, so
// nothing fires after the test is done.
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  for (const hook of mounted.splice(0)) {
    hook.unmount();
  }
});

/**
 * Renders `useHook` inside a QueryClientProvider and exposes its latest result. Enough for the
 * mutation hooks' tests; `act` lets state updates flush.
 */
export function renderHookWithClient<T>(queryClient: QueryClient, useHook: () => T) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const result: { current: T | undefined } = { current: undefined };
  function Probe() {
    result.current = useHook();
    return null;
  }
  let renderer!: ReturnType<typeof create>;
  void act(() => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  mounted.push({ unmount: () => renderer.unmount() });
  return {
    get current(): T {
      return result.current as T;
    },
    act,
    unmount: () => renderer.unmount(),
  };
}
