import { applySamplePreview } from "../previewable";

type Result = {
  data: string[] | undefined;
  error: Error | null;
  isPending: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
  isSuccess: boolean;
  isStale: boolean;
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  refetch: () => void;
};

const refetch = () => undefined;
const pending: Result = {
  data: undefined,
  error: null,
  isPending: true,
  isLoading: true,
  isFetching: true,
  isRefetching: false,
  isError: false,
  isPlaceholderData: false,
  isSuccess: false,
  isStale: true,
  status: "pending",
  fetchStatus: "fetching",
  refetch,
};

describe("applySamplePreview", () => {
  it("returns the real result itself when there is no sample", () => {
    expect(applySamplePreview(pending, undefined)).toBe(pending);
  });

  it("presents the sample as loaded, successful data", () => {
    const sample = ["a"];
    const result = applySamplePreview(pending, sample);
    expect(result).toMatchObject({
      data: sample,
      error: null,
      isPending: false,
      isLoading: false,
      isFetching: false,
      isRefetching: false,
      isError: false,
      isPlaceholderData: false,
      isSuccess: true,
      status: "success",
      fetchStatus: "idle",
    });
    expect(result.data).toBe(sample);
    expect(result.refetch).toBe(refetch);
  });

  it("covers a failed or placeholder real result, and leaves it untouched", () => {
    const failed: Result = {
      ...pending,
      error: new Error("offline"),
      isError: true,
      isPending: false,
      isPlaceholderData: true,
      status: "error",
    };
    const result = applySamplePreview(failed, ["a"]);
    expect(result).toMatchObject({ isError: false, error: null, isPlaceholderData: false });
    expect(failed.isError).toBe(true);
    expect(failed.data).toBeUndefined();
  });
});
