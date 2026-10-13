import * as SplashScreen from "expo-splash-screen";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { View } from "react-native";

import { EmptyState } from "@/components/shared";
import { reportError } from "@/lib/reportError";
import { createThemedStyles } from "@/theme";

type Props = { children: ReactNode };
type State = { hasError: boolean };

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <EmptyState
        layout="centered"
        headline="Something went wrong"
        subtext="Dime hit an unexpected problem. Your data is safe. Try again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </View>
  );
}

/**
 * Root error boundary: catches render-time errors anywhere below it and shows a
 * friendly fallback with a retry that re-mounts the subtree.
 * Errors go through `reportError` (the single crash-reporting hook point).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, `AppErrorBoundary${info.componentStack ?? ""}`);
    // Never leave the native splash covering the fallback.
    void SplashScreen.hideAsync();
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <ErrorFallback onRetry={this.handleRetry} />;
  }
}

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
}));
