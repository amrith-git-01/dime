import type { ReactElement } from "react";

import { useDebouncedValue } from "../useDebouncedValue";

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void> | void;
  create: (element: ReactElement) => { update: (element: ReactElement) => void; unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let latest: string | undefined;
function Probe({ value, delay }: { value: string; delay: number }) {
  latest = useDebouncedValue(value, delay);
  return null;
}

describe("useDebouncedValue", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    latest = undefined;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts with the initial value and follows changes only after the delay", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Probe value="a" delay={200} />);
    });
    expect(latest).toBe("a");

    act(() => renderer.update(<Probe value="ab" delay={200} />));
    expect(latest).toBe("a");
    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(latest).toBe("a");
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(latest).toBe("ab");
    act(() => renderer.unmount());
  });

  it("restarts the wait on every change, so only the last value lands", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Probe value="a" delay={200} />);
    });
    act(() => renderer.update(<Probe value="ab" delay={200} />));
    act(() => {
      jest.advanceTimersByTime(150);
    });
    act(() => renderer.update(<Probe value="abc" delay={200} />));
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(latest).toBe("a");
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(latest).toBe("abc");
    act(() => renderer.unmount());
  });

  it("drops a pending update on unmount", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Probe value="a" delay={200} />);
    });
    act(() => renderer.update(<Probe value="b" delay={200} />));
    act(() => renderer.unmount());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(latest).toBe("a");
  });
});
