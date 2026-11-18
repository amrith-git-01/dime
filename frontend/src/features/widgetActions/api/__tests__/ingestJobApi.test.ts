import { dimeApi } from "@/lib/api/dimeApi";

import { fetchIngestJob } from "../ingestJobApi";

jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: { get: jest.fn() } }));

describe("fetchIngestJob", () => {
  beforeEach(() => {
    jest.mocked(dimeApi.get).mockReset();
    jest.mocked(dimeApi.get).mockResolvedValue({ data: { status: "needs_review" } });
  });

  it("sends X-Dime-Client-Caps: review on every poll so the server answers needs_review", async () => {
    await fetchIngestJob("job-1");
    await fetchIngestJob("job-1", { timeout: 5_000 });
    const calls = jest.mocked(dimeApi.get).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [url, config] of calls) {
      expect(url).toBe("/api/v1/ingest/jobs/job-1");
      expect(config?.headers).toEqual({ "X-Dime-Client-Caps": "review" });
    }
    expect(calls[1][1]?.timeout).toBe(5_000);
  });

  it("returns the job body", async () => {
    await expect(fetchIngestJob("job-1")).resolves.toEqual({ status: "needs_review" });
  });
});
