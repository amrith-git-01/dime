import type { IngestJob } from "../../api/ingestJobApi";
import { outcomeOfJob, pollIngestJob, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "../pollIngestJob";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const TRANSACTION = {
  id: "tx-1",
  amount: "250.00",
  type: "debit" as const,
  counterparty_name: "Swiggy",
  category: "Food",
};

/** A clock the fake `wait` advances, so polling needs no real time. */
function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    wait: jest.fn(async (ms: number) => {
      now += ms;
    }),
  };
}

function axiosError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } });
}

describe("outcomeOfJob", () => {
  it("is null while the job is pending or processing", () => {
    expect(outcomeOfJob({ status: "pending" })).toBeNull();
    expect(outcomeOfJob({ status: "processing" })).toBeNull();
  });

  it("carries the transaction of a done job, or null when it is gone", () => {
    expect(outcomeOfJob({ status: "done", transaction: TRANSACTION })).toEqual({
      kind: "done",
      transaction: TRANSACTION,
    });
    expect(outcomeOfJob({ status: "done" })).toEqual({ kind: "done", transaction: null });
  });

  it("reports a failed job", () => {
    expect(outcomeOfJob({ status: "failed" })).toEqual({ kind: "failed" });
  });
});

describe("pollIngestJob", () => {
  it("returns done as soon as the job is, polling every 2 s", async () => {
    const clock = fakeClock();
    const jobs: IngestJob[] = [
      { status: "pending" },
      { status: "processing" },
      { status: "done", transaction: TRANSACTION },
    ];
    const fetchJob = jest.fn(async () => jobs.shift()!);
    const outcome = await pollIngestJob("job-1", { fetchJob, ...clock });
    expect(outcome).toEqual({ kind: "done", transaction: TRANSACTION });
    expect(fetchJob).toHaveBeenCalledTimes(3);
    expect(clock.wait.mock.calls).toEqual([[POLL_INTERVAL_MS], [POLL_INTERVAL_MS]]);
  });

  it("returns failed for a failed job", async () => {
    const outcome = await pollIngestJob("job-1", {
      fetchJob: async () => ({ status: "failed" }),
      ...fakeClock(),
    });
    expect(outcome).toEqual({ kind: "failed" });
  });

  it("gives up after 20 s with a timeout", async () => {
    const clock = fakeClock();
    const fetchJob = jest.fn(async (): Promise<IngestJob> => ({ status: "processing" }));
    const outcome = await pollIngestJob("job-1", { fetchJob, ...clock });
    expect(outcome).toEqual({ kind: "timeout" });
    // Polls at 0, 2, ... 20 s.
    expect(fetchJob).toHaveBeenCalledTimes(POLL_TIMEOUT_MS / POLL_INTERVAL_MS + 1);
    expect(clock.now()).toBe(POLL_TIMEOUT_MS);
  });

  it("keeps trying through a passing network or server error", async () => {
    const clock = fakeClock();
    const fetchJob = jest
      .fn<Promise<IngestJob>, [string]>()
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(axiosError(503))
      .mockResolvedValueOnce({ status: "done", transaction: TRANSACTION });
    const outcome = await pollIngestJob("job-1", { fetchJob, ...clock });
    expect(outcome).toEqual({ kind: "done", transaction: TRANSACTION });
  });

  it("stops at once on 404 (not this account's job) and 401 (signed out)", async () => {
    for (const status of [404, 401]) {
      const fetchJob = jest.fn().mockRejectedValue(axiosError(status));
      const outcome = await pollIngestJob("job-1", { fetchJob, ...fakeClock() });
      expect(outcome).toEqual({ kind: "failed" });
      expect(fetchJob).toHaveBeenCalledTimes(1);
    }
  });

  it("times out when only errors come back", async () => {
    const outcome = await pollIngestJob("job-1", {
      fetchJob: async () => {
        throw new Error("Network Error");
      },
      ...fakeClock(),
    });
    expect(outcome).toEqual({ kind: "timeout" });
  });

  it("stops polling when the card is gone", async () => {
    const fetchJob = jest.fn(async (): Promise<IngestJob> => ({ status: "pending" }));
    let cancelled = false;
    const outcome = await pollIngestJob("job-1", {
      fetchJob,
      isCancelled: () => cancelled,
      now: () => 0,
      wait: async () => {
        cancelled = true;
      },
    });
    expect(outcome).toEqual({ kind: "timeout" });
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });
});
