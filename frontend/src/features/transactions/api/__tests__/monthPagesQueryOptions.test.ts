import { transactionsQueryKeys } from "../../queryKeys";
import { transactionsMonthPagesQueryOptions } from "../monthPagesQueryOptions";
import { dimeApi } from "@/lib/api/dimeApi";

jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: {
    get: jest.fn().mockResolvedValue({ data: { items: [], has_more: false } }),
  },
}));

const TZ = "Asia/Kolkata";

describe("transactionsMonthPagesQueryOptions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uses the month key the screen reads", () => {
    const options = transactionsMonthPagesQueryOptions({
      userId: "u1",
      year: 2026,
      monthIndex0: 9,
      timezone: TZ,
    });
    expect(options.queryKey).toEqual(
      transactionsQueryKeys.monthPages("u1", 2026, 10, TZ),
    );
  });

  it("always sends the timezone (the server only returns day_summaries with it)", async () => {
    const options = transactionsMonthPagesQueryOptions({
      userId: "u1",
      year: 2026,
      monthIndex0: 9,
      timezone: TZ,
    });
    await (
      options.queryFn as (ctx: { pageParam: number }) => Promise<unknown>
    )({ pageParam: 0 });
    expect(dimeApi.get).toHaveBeenCalledWith(
      "/api/v1/transactions",
      expect.objectContaining({
        params: expect.objectContaining({ timezone: TZ, offset: 0 }),
      }),
    );
  });

  it("keys server-filtered months apart from the unfiltered one", () => {
    const filtered = transactionsMonthPagesQueryOptions({
      userId: "u1",
      year: 2026,
      monthIndex0: 9,
      timezone: TZ,
      filters: { payee: "swiggy" },
    });
    expect(filtered.queryKey).toEqual(
      transactionsQueryKeys.filteredMonthPages("u1", 2026, 10, TZ, {
        payee: "swiggy",
      }),
    );
  });
});
