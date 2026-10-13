import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SplashRevealContextValue = {
  contentReady: boolean;
  layoutReady: boolean;
  /**
   * The screen behind the splash has laid out (main tabs: header + tab bar; auth / onboarding:
   * the route is mounted). One-way: once true it stays true, so a remount cannot re-gate it.
   */
  shellReady: boolean;
  setContentReady: (ready: boolean) => void;
  setLayoutReady: (ready: boolean) => void;
  markShellReady: () => void;
};

const SplashRevealContext = createContext<SplashRevealContextValue | null>(
  null,
);

export function SplashRevealProvider({ children }: { children: ReactNode }) {
  const [contentReady, setContentReadyState] = useState(false);
  const [layoutReady, setLayoutReadyState] = useState(false);
  const [shellReady, setShellReadyState] = useState(false);

  const setContentReady = useCallback((ready: boolean) => {
    setContentReadyState(ready);
  }, []);

  const setLayoutReady = useCallback((ready: boolean) => {
    setLayoutReadyState(ready);
  }, []);

  const markShellReady = useCallback(() => {
    setShellReadyState(true);
  }, []);

  const value = useMemo(
    () => ({
      contentReady,
      layoutReady,
      shellReady,
      setContentReady,
      setLayoutReady,
      markShellReady,
    }),
    [
      contentReady,
      layoutReady,
      shellReady,
      setContentReady,
      setLayoutReady,
      markShellReady,
    ],
  );

  return (
    <SplashRevealContext.Provider value={value}>
      {children}
    </SplashRevealContext.Provider>
  );
}

export function useSplashReveal() {
  const context = useContext(SplashRevealContext);
  if (!context) {
    throw new Error("useSplashReveal must be used within SplashRevealProvider");
  }
  return context;
}
