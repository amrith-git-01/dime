import { applySamplePreview } from "../utils/previewable";
import type { TourSampleMonth } from "../utils/buildSampleMonth";

import { useTourSampleMonth } from "./useTourSampleMonth";

/**
 * While the guided tour previews sample data for an empty account, returns `real` with the
 * sample standing in as its data; otherwise returns `real` unchanged. Call it AFTER the real
 * `useQuery` (which stays as it was), and have `selectSample` return `undefined` for anything the
 * sample does not cover (another month, a filtered list) so those stay real.
 *
 * The sample lives only in this return value: it is never put in the QueryClient, so it cannot be
 * persisted, refetched over, or shown to another account.
 */
export function usePreviewable<R extends { data: unknown }>(
  real: R,
  selectSample: (sample: TourSampleMonth) => R["data"] | undefined,
): R {
  const sample = useTourSampleMonth();
  return applySamplePreview(real, sample ? selectSample(sample) : undefined);
}
