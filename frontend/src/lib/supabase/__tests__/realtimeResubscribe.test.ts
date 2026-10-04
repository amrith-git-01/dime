import { createResubscribeHandler } from "../realtimeResubscribe";

describe("createResubscribeHandler", () => {
  it("ignores the first SUBSCRIBED", () => {
    const onResubscribed = jest.fn();
    createResubscribeHandler(onResubscribed)("SUBSCRIBED");
    expect(onResubscribed).not.toHaveBeenCalled();
  });

  it("fires on every SUBSCRIBED after the first", () => {
    const onResubscribed = jest.fn();
    const handler = createResubscribeHandler(onResubscribed);
    handler("SUBSCRIBED");
    handler("CHANNEL_ERROR");
    handler("CLOSED");
    expect(onResubscribed).not.toHaveBeenCalled();
    handler("SUBSCRIBED");
    expect(onResubscribed).toHaveBeenCalledTimes(1);
    handler("TIMED_OUT");
    handler("SUBSCRIBED");
    expect(onResubscribed).toHaveBeenCalledTimes(2);
  });

  it("does not count failures before the first SUBSCRIBED as a reconnect", () => {
    const onResubscribed = jest.fn();
    const handler = createResubscribeHandler(onResubscribed);
    handler("CHANNEL_ERROR");
    handler("SUBSCRIBED");
    expect(onResubscribed).not.toHaveBeenCalled();
  });
});
