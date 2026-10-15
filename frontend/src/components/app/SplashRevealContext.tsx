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
  /** The branded splash overlay is gone and the app is visible. One-way, like `shellReady`. */
  splashRevealed: boolean;
  setContentReady: (ready: boolean) => void;
  setLayoutReady: (ready: boolean) => void;
  markShellReady: () => void;
  markSplashRevealed: () => void;
};

const SplashRevealContext = createContext<SplashRevealContextValue | null>(
  null,
);

export function SplashRevealProvider({ children }: { children: ReactNode }) {
  const [contentReady, setContentReadyState] = useState(false);
  const [layoutReady, setLayoutReadyState] = useState(false);
  const [shellReady, setShellReadyState] = useState(false);
  const [splashRevealed, setSplashRevealedState] = useState(false);

  const setContentReady = useCallback((ready: boolean) => {
    setContentReadyState(ready);
  }, []);

  const setLayoutReady = useCallback((ready: boolean) => {
    setLayoutReadyState(ready);
  }, []);

  const markShellReady = useCallback(() => {
    setShellReadyState(true);
  }, []);

  const markSplashRevealed = useCallback(() => {
    setSplashRevealedState(true);
  }, []);

  const value = useMemo(
    () => ({
      contentReady,
      layoutReady,
      shellReady,
      splashRevealed,
      setContentReady,
      setLayoutReady,
      markShellReady,
      markSplashRevealed,
    }),
    [
      contentReady,
      layoutReady,
      shellReady,
      splashRevealed,
      setContentReady,
      setLayoutReady,
      markShellReady,
      markSplashRevealed,
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
