import { AxiosError } from "axios";

import { SubmitError } from "../failure";
import { sendOrQueue } from "../sendOrQueue";

function setup(over: { online?: boolean; send?: () => Promise<string> } = {}) {
  const queue = jest.fn();
  const send = jest.fn(over.send ?? (() => Promise.resolve("saved")));
  const run = () =>
    sendOrQueue({ isOnline: () => over.online ?? true, send, queue });
  return { queue, send, run };
}

describe("sendOrQueue", () => {
  it("offline: queues straight away and never calls the network", async () => {
    const { queue, send, run } = setup({ online: false });
    await expect(run()).resolves.toEqual({ status: "queued" });
    expect(send).not.toHaveBeenCalled();
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it("online: sends and reports the result", async () => {
    const { queue, run } = setup();
    await expect(run()).resolves.toEqual({ status: "sent", value: "saved" });
    expect(queue).not.toHaveBeenCalled();
  });

  it.each([
    ["a network error", new AxiosError("Network Error", AxiosError.ERR_NETWORK)],
    ["a timeout", new AxiosError("timeout", AxiosError.ECONNABORTED)],
    ["a 5xx", new SubmitError("Bad gateway", { status: 502 })],
    ["a rate limit", new SubmitError("Too many requests", { status: 429, retryAfterSeconds: 10 })],
    ["a request still being processed", new SubmitError("still being processed", { status: 409 })],
  ])("online but %s: queues it instead of failing", async (_name, error) => {
    const { queue, run } = setup({ send: () => Promise.reject(error) });
    await expect(run()).resolves.toEqual({ status: "queued" });
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it("the AuthNetworkError of an unreachable refresh also queues", async () => {
    const error = new Error("Can't reach the server.");
    error.name = "AuthNetworkError";
    const { queue, run } = setup({ send: () => Promise.reject(error) });
    await expect(run()).resolves.toEqual({ status: "queued" });
    expect(queue).toHaveBeenCalled();
  });

  it("a 4xx validation error is rethrown (the form keeps its error UX), nothing is queued", async () => {
    const error = new SubmitError("Input should be greater than 0", { status: 422 });
    const { queue, run } = setup({ send: () => Promise.reject(error) });
    await expect(run()).rejects.toBe(error);
    expect(queue).not.toHaveBeenCalled();
  });

  it("the daily capture limit is rethrown too", async () => {
    const error = new SubmitError("You've used today's 10 receipt scans. Try again tomorrow.", { status: 429 });
    const { queue, run } = setup({ send: () => Promise.reject(error) });
    await expect(run()).rejects.toBe(error);
    expect(queue).not.toHaveBeenCalled();
  });
});
