import { decideSmsGate, shouldHoldSmsReviewRoute } from "../smsGate";
import { collectKeptSms, shouldKeepSms } from "../smsMatcher";
import { redactSmsBody } from "../smsRedact";
import type { InboxSms } from "../smsTypes";

function sms(partial: Partial<InboxSms> & Pick<InboxSms, "body">): InboxSms {
  return {
    id: partial.id ?? "1",
    address: partial.address ?? "VK-HDFCBK",
    dateMs: partial.dateMs ?? 1_700_000_000_000,
    body: partial.body,
  };
}

const mixed: InboxSms[] = [
  sms({ id: "otp", dateMs: 10, address: "VK-HDFCBK", body: "OTP 111111" }),
  sms({
    id: "old",
    dateMs: 20,
    address: "VK-HDFCBK",
    body: "Rs 10 debited at A",
  }),
  sms({
    id: "new",
    dateMs: 30,
    address: "VK-HDFCBK",
    body: "Rs 20 debited at B",
  }),
];

describe("shouldKeepSms", () => {
  it("drops 10-digit senders", () => {
    expect(
      shouldKeepSms(
        sms({ address: "9876543210", body: "Rs 500 debited at Swiggy" }),
      ),
    ).toBe(false);
    expect(
      shouldKeepSms(
        sms({ address: "+919876543210", body: "Rs 500 debited at Swiggy" }),
      ),
    ).toBe(false);
  });

  it("drops OTP messages without a money verb", () => {
    expect(
      shouldKeepSms(
        sms({ address: "VK-HDFCBK", body: "Your OTP is 482193 for login" }),
      ),
    ).toBe(false);
  });

  it("keeps bank debits that mention OTP when a money verb is present", () => {
    expect(
      shouldKeepSms(
        sms({
          address: "VK-HDFCBK",
          body: "Rs 1200 debited. OTP not required. UPI Ref 123",
        }),
      ),
    ).toBe(true);
  });

  it("drops promos without a transaction", () => {
    expect(
      shouldKeepSms(
        sms({
          address: "AD-PROMO",
          body: "Flat 50% off. Unsubscribe to stop.",
        }),
      ),
    ).toBe(false);
  });

  it("keeps registry senders, unknown senders with amount+verb, credits and failed txns", () => {
    expect(
      shouldKeepSms(
        sms({
          address: "AD-HDFCBK",
          body: "INR 250.00 debited from A/c XX1234 at SWIGGY",
        }),
      ),
    ).toBe(true);
    expect(
      shouldKeepSms(
        sms({
          address: "JM-XYZBNK",
          body: "Rs. 99.00 spent at Zomato via UPI",
        }),
      ),
    ).toBe(true);
    expect(
      shouldKeepSms(
        sms({
          address: "AD-SBIINB",
          body: "INR 50000 credited to A/c XX9999. Avl Bal INR 1",
        }),
      ),
    ).toBe(true);
    expect(
      shouldKeepSms(
        sms({
          address: "VK-ICICIB",
          body: "UPI txn of Rs 10 failed. Not debited.",
        }),
      ),
    ).toBe(true);
  });
});

describe("collectKeptSms", () => {
  it("applies the cap, keeps the oldest first and inspects all input", () => {
    const collected = collectKeptSms(mixed, 1);
    expect(collected.kept).toHaveLength(1);
    expect(collected.kept[0]?.id).toBe("old");
    expect(collected.inspectedMaxDateMs).toBe(30);
  });
});

describe("redactSmsBody", () => {
  it("keeps amount, payee and UPI ref but masks account tail and OTP", () => {
    const redacted = redactSmsBody(
      "INR 250.00 debited from A/c XX1234 at SWIGGY UPI Ref 9988776655. OTP 482193",
    );
    expect(redacted).toContain("250.00");
    expect(redacted).toContain("SWIGGY");
    expect(redacted).toContain("9988776655");
    expect(redacted).not.toMatch(/XX1234/i);
    expect(redacted).not.toContain("482193");
  });
});

describe("decideSmsGate", () => {
  it("skips when the toggle is off", () => {
    const skip = decideSmsGate({
      toggleOn: false,
      permissionGranted: true,
      watermarkMs: 1,
      inbox: mixed,
    });
    expect(skip.kind).toBe("skip");
  });

  it("opens review when kept messages exist", () => {
    const review = decideSmsGate({
      toggleOn: true,
      permissionGranted: true,
      watermarkMs: 1,
      inbox: mixed,
    });
    expect(review.kind).toBe("review");
  });

  it("advances the watermark when only OTPs arrive", () => {
    const zero = decideSmsGate({
      toggleOn: true,
      permissionGranted: true,
      watermarkMs: 1,
      inbox: [sms({ id: "otp2", dateMs: 40, body: "Your OTP is 222222" })],
    });
    expect(zero.kind).toBe("zero-kept");
    if (zero.kind === "zero-kept") {
      expect(zero.nextWatermarkMs).toBe(40);
    }
  });

  it("skips without moving the watermark when there are no new sms", () => {
    const empty = decideSmsGate({
      toggleOn: true,
      permissionGranted: true,
      watermarkMs: 1,
      inbox: [],
    });
    expect(empty.kind).toBe("skip");
  });
});

describe("shouldHoldSmsReviewRoute", () => {
  it("only holds the review route in the review phase with the toggle on", () => {
    expect(shouldHoldSmsReviewRoute(true, "idle")).toBe(false);
    expect(shouldHoldSmsReviewRoute(true, "scanning")).toBe(false);
    expect(shouldHoldSmsReviewRoute(true, "review")).toBe(true);
    expect(shouldHoldSmsReviewRoute(true, "done")).toBe(false);
    expect(shouldHoldSmsReviewRoute(false, "review")).toBe(false);
  });
});
