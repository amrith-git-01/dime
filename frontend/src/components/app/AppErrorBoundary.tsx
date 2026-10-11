import * as SplashScreen from "expo-splash-screen";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/shared";
import { colors } from "@/constants";
import { reportError } from "@/lib/reportError";

type Props = { children: ReactNode };
type State = { hasError: boolean };

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

    return (
      <View style={styles.root}>
        <EmptyState
          layout="centered"
          headline="Something went wrong"
          subtext="Dime hit an unexpected problem. Your data is safe. Try again."
          actionLabel="Try again"
          onAction={this.handleRetry}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
});
