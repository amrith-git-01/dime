import { decideSmsGate, shouldHoldSmsReviewRoute } from "../smsGate";
import { collectKeptSms, shouldKeepSms } from "../smsMatcher";
import { redactSmsBody } from "../smsRedact";
import type { InboxSms } from "../smsTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function sms(partial: Partial<InboxSms> & Pick<InboxSms, "body">): InboxSms {
  return {
    id: partial.id ?? "1",
    address: partial.address ?? "VK-HDFCBK",
    dateMs: partial.dateMs ?? 1_700_000_000_000,
    body: partial.body,
  };
}

function run(): void {
  assert(
    !shouldKeepSms(
      sms({ address: "9876543210", body: "Rs 500 debited at Swiggy" }),
    ),
    "10-digit sender must drop",
  );
  assert(
    !shouldKeepSms(
      sms({ address: "+919876543210", body: "Rs 500 debited at Swiggy" }),
    ),
    "+91 10-digit sender must drop",
  );
  assert(
    !shouldKeepSms(
      sms({ address: "VK-HDFCBK", body: "Your OTP is 482193 for login" }),
    ),
    "OTP without money verb must drop",
  );
  assert(
    shouldKeepSms(
      sms({
        address: "VK-HDFCBK",
        body: "Rs 1200 debited. OTP not required. UPI Ref 123",
      }),
    ),
    "bank debit with OTP word still keep if money verb present",
  );
  assert(
    !shouldKeepSms(
      sms({
        address: "AD-PROMO",
        body: "Flat 50% off. Unsubscribe to stop.",
      }),
    ),
    "promo without txn must drop",
  );
  assert(
    shouldKeepSms(
      sms({
        address: "AD-HDFCBK",
        body: "INR 250.00 debited from A/c XX1234 at SWIGGY",
      }),
    ),
    "registry sender must keep",
  );
  assert(
    shouldKeepSms(
      sms({
        address: "JM-XYZBNK",
        body: "Rs. 99.00 spent at Zomato via UPI",
      }),
    ),
    "unknown sender + amount + verb must keep",
  );
  assert(
    shouldKeepSms(
      sms({
        address: "AD-SBIINB",
        body: "INR 50000 credited to A/c XX9999. Avl Bal INR 1",
      }),
    ),
    "credits must keep",
  );
  assert(
    shouldKeepSms(
      sms({
        address: "VK-ICICIB",
        body: "UPI txn of Rs 10 failed. Not debited.",
      }),
    ),
    "failed txn must keep",
  );

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
  const collected = collectKeptSms(mixed, 1);
  assert(collected.kept.length === 1, "cap must apply");
  assert(collected.kept[0]?.id === "old", "oldest kept first");
  assert(collected.inspectedMaxDateMs === 30, "inspected max is all input");

  const redacted = redactSmsBody(
    "INR 250.00 debited from A/c XX1234 at SWIGGY UPI Ref 9988776655. OTP 482193",
  );
  assert(redacted.includes("250.00"), "keep amount");
  assert(redacted.includes("SWIGGY"), "keep payee");
  assert(redacted.includes("9988776655"), "keep UPI ref");
  assert(!/XX1234/i.test(redacted), "mask account tail");
  assert(!redacted.includes("482193"), "strip OTP digits");

  const skip = decideSmsGate({
    toggleOn: false,
    permissionGranted: true,
    watermarkMs: 1,
    inbox: mixed,
  });
  assert(skip.kind === "skip", "toggle off skips");

  const review = decideSmsGate({
    toggleOn: true,
    permissionGranted: true,
    watermarkMs: 1,
    inbox: mixed,
  });
  assert(review.kind === "review", "kept messages open review");

  const zero = decideSmsGate({
    toggleOn: true,
    permissionGranted: true,
    watermarkMs: 1,
    inbox: [sms({ id: "otp2", dateMs: 40, body: "Your OTP is 222222" })],
  });
  assert(zero.kind === "zero-kept", "otp-only advances watermark");
  if (zero.kind === "zero-kept") {
    assert(zero.nextWatermarkMs === 40, "zero-kept uses max inspected");
  }

  const empty = decideSmsGate({
    toggleOn: true,
    permissionGranted: true,
    watermarkMs: 1,
    inbox: [],
  });
  assert(empty.kind === "skip", "no new sms skips without moving watermark");

  assert(!shouldHoldSmsReviewRoute(true, "idle"), "idle must not steal Home");
  assert(
    !shouldHoldSmsReviewRoute(true, "scanning"),
    "scanning must not steal Home",
  );
  assert(
    shouldHoldSmsReviewRoute(true, "review"),
    "review phase holds Bank messages",
  );
  assert(!shouldHoldSmsReviewRoute(true, "done"), "done must not steal Home");
  assert(
    !shouldHoldSmsReviewRoute(false, "review"),
    "toggle off never holds review",
  );

  console.log("sms ingest tests passed");
}

run();
