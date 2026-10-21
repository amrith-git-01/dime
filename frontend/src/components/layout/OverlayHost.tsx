import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { StyleSheet, View } from "react-native";

type OverlayHostValue = {
  /** The layer overlays are positioned in; measure anchors relative to it. */
  layer: RefObject<View | null>;
  /** The layer's current height, so an overlay can stay inside it. */
  layerHeight: () => number;
  setOverlay: (node: ReactNode) => void;
};

const OverlayHostContext = createContext<OverlayHostValue | null>(null);

/** The nearest `OverlayHost`, or null when there is none. */
export function useOverlayHost(): OverlayHostValue | null {
  return useContext(OverlayHostContext);
}

/**
 * A layer over `children` for things that float above the content, such as a dropdown under an input. Android only
 * dispatches native touches (scrolling, focusing a text field) to views inside their parents' bounds, so an overlay
 * hanging out of its own small parent can't scroll and lets touches through to whatever is under it. Rendered here,
 * it sits inside a parent that covers the content and receives touches first.
 */
export function OverlayHost({ children }: { children: ReactNode }) {
  const layer = useRef<View>(null);
  const height = useRef(0);
  const [overlay, setOverlay] = useState<ReactNode>(null);
  const [value] = useState<OverlayHostValue>(() => ({
    layer,
    layerHeight: () => height.current,
    setOverlay,
  }));

  return (
    <OverlayHostContext.Provider value={value}>
      {children}
      <View
        ref={layer}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          height.current = e.nativeEvent.layout.height;
        }}
      >
        {overlay}
      </View>
    </OverlayHostContext.Provider>
  );
}
