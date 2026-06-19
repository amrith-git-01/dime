import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type InsightsScrollVisibilityContextValue = {
  scrollGeneration: number;
  reportScroll: () => void;
};

const noopScrollVisibility: InsightsScrollVisibilityContextValue = {
  scrollGeneration: 0,
  reportScroll: () => {},
};

const InsightsScrollVisibilityContext =
  createContext<InsightsScrollVisibilityContextValue>(noopScrollVisibility);

export function InsightsScrollVisibilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [scrollGeneration, setScrollGeneration] = useState(0);
  const frameRef = useRef<number | null>(null);

  const reportScroll = useCallback(() => {
    if (frameRef.current != null) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setScrollGeneration((value) => value + 1);
    });
  }, []);

  const value = useMemo(
    () => ({ scrollGeneration, reportScroll }),
    [reportScroll, scrollGeneration],
  );

  return (
    <InsightsScrollVisibilityContext.Provider value={value}>
      {children}
    </InsightsScrollVisibilityContext.Provider>
  );
}

export function useInsightsScrollVisibility(): InsightsScrollVisibilityContextValue {
  return useContext(InsightsScrollVisibilityContext);
}
