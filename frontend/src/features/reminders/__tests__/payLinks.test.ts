import {
  buildUpiUri,
  exceedsPayLimit,
  normalizePayAmount,
  sanitizePayName,
  sanitizePayNote,
} from "../utils/payLinks";

describe("sanitizePayName", () => {
  it("keeps letters, digits, spaces, dots and dashes", () => {
    expect(sanitizePayName("Ravi Kumar")).toBe("Ravi Kumar");
    expect(sanitizePayName("A.B. Co-op 2")).toBe("A.B. Co-op 2");
  });

  it("strips everything else and collapses spaces", () => {
    expect(sanitizePayName("Ravi <b>K</b>  & Sons!")).toBe("Ravi bKb Sons");
    expect(sanitizePayName("  Ravi\tKumar\n")).toBe("Ravi Kumar");
    expect(sanitizePayName("Ravi 🙂")).toBe("Ravi");
  });

  it("truncates to 40 characters", () => {
    const long = sanitizePayName("A".repeat(60));
    expect(long).toBe("A".repeat(40));
    // A cut that lands on a space does not leave it dangling.
    expect(sanitizePayName(`${"B".repeat(39)} tail`)).toBe("B".repeat(39));
  });

  it("is null when nothing is left or the name poses as the app", () => {
    expect(sanitizePayName("")).toBeNull();
    expect(sanitizePayName(null)).toBeNull();
    expect(sanitizePayName(undefined)).toBeNull();
    expect(sanitizePayName("@@!!")).toBeNull();
    expect(sanitizePayName("Dime Support")).toBeNull();
    expect(sanitizePayName("my DIME team")).toBeNull();
    // Stripping must not be a way to sneak the word in.
    expect(sanitizePayName("Di!me")).toBeNull();
  });

  it("blocks only the whole word, not letters inside another word", () => {
    expect(sanitizePayName("Dimple")).toBe("Dimple");
    expect(sanitizePayName("Dimension Cafe")).toBe("Dimension Cafe");
    expect(sanitizePayName("Sundime")).toBe("Sundime");
    expect(sanitizePayName("dime")).toBeNull();
    expect(sanitizePayName("Dime-Pay")).toBeNull();
  });
});

describe("sanitizePayNote", () => {
  it("keeps the allowed punctuation", () => {
    expect(sanitizePayNote("Rent (Nov) #2 - 50% off, ok?")).toBe("Rent (Nov) #2 - 50% off, ok?");
  });

  it("strips the rest and truncates to 80", () => {
    expect(sanitizePayNote("Rent <script>alert(1)</script>")).toBe("Rent scriptalert(1)/script");
    expect(sanitizePayNote("x".repeat(100))).toBe("x".repeat(80));
    expect(sanitizePayNote("   ")).toBeNull();
    expect(sanitizePayNote(null)).toBeNull();
  });
});

describe("normalizePayAmount", () => {
  it("returns a two-decimal amount in range", () => {
    expect(normalizePayAmount("500")).toBe("500.00");
    expect(normalizePayAmount("15000.5")).toBe("15000.50");
    expect(normalizePayAmount(0.01)).toBe("0.01");
    expect(normalizePayAmount("1000000")).toBe("1000000.00");
  });

  it("is null when missing or not payable", () => {
    expect(normalizePayAmount(null)).toBeNull();
    expect(normalizePayAmount(undefined)).toBeNull();
    expect(normalizePayAmount("")).toBeNull();
    expect(normalizePayAmount("0")).toBeNull();
    expect(normalizePayAmount("-5")).toBeNull();
    expect(normalizePayAmount("abc")).toBeNull();
    expect(normalizePayAmount("1000000.01")).toBeNull();
  });
});

describe("exceedsPayLimit", () => {
  it("is true only above 1,000,000", () => {
    expect(exceedsPayLimit("1000000")).toBe(false);
    expect(exceedsPayLimit("1000000.01")).toBe(true);
    expect(exceedsPayLimit(5_000_000)).toBe(true);
    expect(exceedsPayLimit(null)).toBe(false);
    expect(exceedsPayLimit("")).toBe(false);
    expect(exceedsPayLimit("abc")).toBe(false);
  });
});

describe("buildUpiUri", () => {
  it("builds the upi://pay address", () => {
    expect(
      buildUpiUri({ upiId: "landlord@okbank", name: "Mr. Rao", amount: "15000", note: "Rent Nov" }),
    ).toBe("upi://pay?pa=landlord@okbank&pn=Mr.%20Rao&am=15000.00&cu=INR&tn=Rent%20Nov");
  });

  it("is null for an invalid UPI id or amount", () => {
    expect(buildUpiUri({ upiId: "nope", amount: "10" })).toBeNull();
    expect(buildUpiUri({ upiId: "a.b@bank", amount: "-1" })).toBeNull();
  });

  it("never lets a note or name inject another parameter", () => {
    const uri = buildUpiUri({ upiId: "a.b@bank", name: "Ravi", note: "x&am=1&pa=evil@bank", amount: "10" });
    // The note loses its "=" and is percent-encoded, so there is exactly one pa and one am.
    expect(uri).toContain("tn=x%26am1%26paevil%40bank");
    expect(uri!.match(/[?&]pa=/g)).toHaveLength(1);
    expect(uri!.match(/[?&]am=/g)).toHaveLength(1);
  });

  it("works without optional parts", () => {
    expect(buildUpiUri({ upiId: "a.b@bank" })).toBe("upi://pay?pa=a.b@bank&cu=INR");
  });
});
