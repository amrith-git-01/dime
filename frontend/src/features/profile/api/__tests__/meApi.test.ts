import { dimeApi } from "@/lib/api/dimeApi";

import { fetchMe, ME_REQUEST_TIMEOUT_MS } from "../meApi";

jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: { get: jest.fn() },
}));

const get = dimeApi.get as jest.Mock;

describe("fetchMe", () => {
  beforeEach(() => get.mockReset());

  it("bounds the request to about 10 seconds", async () => {
    get.mockResolvedValue({ data: { id: "u" } });
    await expect(fetchMe()).resolves.toEqual({ id: "u" });
    expect(get).toHaveBeenCalledWith("/api/v1/me", { timeout: ME_REQUEST_TIMEOUT_MS });
    expect(ME_REQUEST_TIMEOUT_MS).toBe(10_000);
  });
});
