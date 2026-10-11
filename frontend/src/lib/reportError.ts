/**
 * Single entry point for reporting handled and unhandled errors.
 *
 * Dev: logs to the console. Release: silent. This is the one place to forward
 * errors to a crash-reporting service (e.g. Sentry) once one is installed;
 * every caller (root error boundary, query/mutation caches, bootstrap) already
 * routes through here. Never pass PII in `context`.
 */
export function reportError(error: unknown, context?: string): void {
  if (__DEV__) {
    console.error(context ? `[${context}]` : "[error]", error);
  }
}
