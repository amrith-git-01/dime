/** The part of a query result a screen reads; `usePreviewable` swaps these for sample data. */
type PreviewableResult = { data: unknown };

/**
 * `real` with `sample` standing in as loaded, successful data. The real result is returned
 * untouched when there is no sample, so screens keep every real field (and RQ's tracked-props
 * optimisation) outside the tour. Pure: nothing is written anywhere.
 */
export function applySamplePreview<R extends PreviewableResult>(
  real: R,
  sample: R["data"] | undefined,
): R {
  if (sample === undefined) {
    return real;
  }
  return {
    ...real,
    data: sample,
    error: null,
    isPending: false,
    isLoading: false,
    isFetching: false,
    isRefetching: false,
    isError: false,
    isPlaceholderData: false,
    isSuccess: true,
    isStale: false,
    status: "success",
    fetchStatus: "idle",
  };
}
