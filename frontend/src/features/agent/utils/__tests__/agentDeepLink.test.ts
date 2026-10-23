import { toTransactionsListParams } from "../agentDeepLink";

jest.mock("@/navigation/navigationRef", () => ({ navigationRef: {} }));

const payee = {
  filter: "payee",
  year: 2026,
  monthIndex0: 9,
  payeeId: "acme",
  payeeDisplayName: "Acme",
  payeeKeysTop: ["acme", "bob"],
};

describe("toTransactionsListParams (payee)", () => {
  it("leaves direction out by default, so the list shows debits", () => {
    const result = toTransactionsListParams(payee);
    expect(result).toMatchObject({ filter: "payee", payeeId: "acme" });
    expect(result).not.toHaveProperty("direction");
  });

  it("passes a credit direction through", () => {
    expect(toTransactionsListParams({ ...payee, direction: "credit" })).toMatchObject({
      filter: "payee",
      direction: "credit",
    });
  });

  it("ignores any other direction value", () => {
    expect(toTransactionsListParams({ ...payee, direction: "sideways" })).not.toHaveProperty(
      "direction",
    );
  });
});
