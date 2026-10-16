import { emitWidgetTransactionsChanged, onWidgetTransactionsChanged } from "../widgetCaptureEvents";

describe("widget capture events", () => {
  it("reaches every listener until it unsubscribes", () => {
    const a = jest.fn();
    const b = jest.fn();
    const offA = onWidgetTransactionsChanged(a);
    const offB = onWidgetTransactionsChanged(b);
    emitWidgetTransactionsChanged();
    offA();
    emitWidgetTransactionsChanged();
    offB();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("a throwing listener does not stop the others", () => {
    const after = jest.fn();
    const offThrowing = onWidgetTransactionsChanged(() => {
      throw new Error("boom");
    });
    const offAfter = onWidgetTransactionsChanged(after);
    expect(() => emitWidgetTransactionsChanged()).not.toThrow();
    expect(after).toHaveBeenCalled();
    offThrowing();
    offAfter();
  });
});
