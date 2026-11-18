import { createElement } from "react";

import { useManualAddTransactionForm } from "../useManualAddTransactionForm";
import type { ManualAddFormSnapshot } from "../../utils/transactionRowToFormState";

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void> | void;
  create: (element: unknown) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Form = ReturnType<typeof useManualAddTransactionForm>;

function mount(initial?: ManualAddFormSnapshot) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const ref: { current: Form | undefined } = { current: undefined };
  function Probe() {
    ref.current = useManualAddTransactionForm(initial);
    return null;
  }
  let renderer!: { unmount: () => void };
  void act(() => {
    renderer = create(createElement(Probe));
  });
  return {
    get form(): Form {
      return ref.current as Form;
    },
    act,
    unmount: () => {
      void act(() => {
        renderer.unmount();
      });
    },
  };
}

describe("useManualAddTransactionForm: Spend / Income / Transfer", () => {
  it("starts as a spend and builds the payload with its kind", () => {
    const hook = mount();
    expect(hook.form.kind).toBe("spend");
    void hook.act(() => {
      hook.form.setAmountText("250.50");
      hook.form.changeCounterpartyName("Swiggy");
    });
    expect(hook.form.buildPayload()).toMatchObject({ amount: "250.50", type: "debit", kind: "spend" });
    hook.unmount();
  });

  it("Income makes it a credit, Spend a debit, and each says so in the payload", () => {
    const hook = mount();
    void hook.act(() => {
      hook.form.setAmountText("100");
      hook.form.changeCounterpartyName("Ravi");
      hook.form.setKind("income");
    });
    expect(hook.form.txType).toBe("credit");
    expect(hook.form.buildPayload()).toMatchObject({ type: "credit", kind: "income" });
    void hook.act(() => hook.form.setKind("spend"));
    expect(hook.form.txType).toBe("debit");
    expect(hook.form.buildPayload()).toMatchObject({ type: "debit", kind: "spend" });
    hook.unmount();
  });

  it("a Transfer keeps the direction chosen, and the Expense / Income switch cannot turn it back", () => {
    const hook = mount();
    void hook.act(() => {
      hook.form.setAmountText("5000");
      hook.form.changeCounterpartyName("HDFC to ICICI");
      hook.form.setKind("transfer");
    });
    expect(hook.form.buildPayload()).toMatchObject({ type: "debit", kind: "transfer" });
    void hook.act(() => hook.form.setTxType("credit"));
    expect(hook.form.kind).toBe("transfer");
    expect(hook.form.buildPayload()).toMatchObject({ type: "credit", kind: "transfer" });
    hook.unmount();
  });

  it("the Expense / Income switch outside a transfer moves the kind with it", () => {
    const hook = mount();
    void hook.act(() => hook.form.setTxType("credit"));
    expect(hook.form.kind).toBe("income");
    void hook.act(() => hook.form.setTxType("debit"));
    expect(hook.form.kind).toBe("spend");
    hook.unmount();
  });

  it("picking the Transfer payee type makes it a transfer; picking another type puts it back", () => {
    const hook = mount();
    void hook.act(() => hook.form.setCounterpartyType("self_transfer"));
    expect(hook.form.kind).toBe("transfer");
    void hook.act(() => hook.form.setCounterpartyType("merchant"));
    expect(hook.form.kind).toBe("spend");
    hook.unmount();
  });

  it("an explicit Transfer stays a transfer when the payee type moves between ordinary ones", () => {
    const hook = mount();
    void hook.act(() => hook.form.setKind("transfer"));
    void hook.act(() => hook.form.setCounterpartyType("person"));
    expect(hook.form.kind).toBe("transfer");
    hook.unmount();
  });

  it("an edit of a payback keeps it a payback until the user chooses otherwise", () => {
    const hook = mount({
      amountText: "300",
      txType: "credit",
      kind: "payback",
      counterpartyName: "Ravi",
      counterpartyType: "person",
      brandId: null,
      category: "",
      categoryId: null,
      note: "",
      transactionAt: new Date("2026-10-15T08:00:00.000Z"),
    });
    expect(hook.form.buildPayload()).toMatchObject({ type: "credit", kind: "payback" });
    void hook.act(() => hook.form.setKind("income"));
    expect(hook.form.buildPayload()).toMatchObject({ kind: "income" });
    hook.unmount();
  });

  it("rejects what the strict amount parser rejects: a third decimal, junk, and more than the API allows", () => {
    const hook = mount();
    void hook.act(() => hook.form.changeCounterpartyName("Shop"));
    for (const bad of ["12.345", "12abc", "0", "10000000.01"]) {
      void hook.act(() => hook.form.setAmountText(bad));
      expect(hook.form.buildPayload()).toBeNull();
    }
    void hook.act(() => hook.form.setAmountText("10000000"));
    expect(hook.form.buildPayload()).toMatchObject({ amount: "10000000.00" });
    hook.unmount();
  });

  it("Clear puts it back to a spend", () => {
    const hook = mount();
    void hook.act(() => hook.form.setKind("transfer"));
    void hook.act(() => hook.form.reset());
    expect(hook.form.kind).toBe("spend");
    expect(hook.form.txType).toBe("debit");
    hook.unmount();
  });
});
