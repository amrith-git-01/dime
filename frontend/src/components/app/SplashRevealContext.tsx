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
  setContentReady: (ready: boolean) => void;
  setLayoutReady: (ready: boolean) => void;
};

const SplashRevealContext = createContext<SplashRevealContextValue | null>(
  null,
);

export function SplashRevealProvider({ children }: { children: ReactNode }) {
  const [contentReady, setContentReadyState] = useState(false);
  const [layoutReady, setLayoutReadyState] = useState(false);

  const setContentReady = useCallback((ready: boolean) => {
    setContentReadyState(ready);
  }, []);

  const setLayoutReady = useCallback((ready: boolean) => {
    setLayoutReadyState(ready);
  }, []);

  const value = useMemo(
    () => ({
      contentReady,
      layoutReady,
      setContentReady,
      setLayoutReady,
    }),
    [contentReady, layoutReady, setContentReady, setLayoutReady],
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
