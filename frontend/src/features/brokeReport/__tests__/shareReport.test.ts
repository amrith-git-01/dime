import { makeImageFromView } from "@shopify/react-native-skia";
import { writeAsStringAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

import { FULL_SNAPSHOT, MINIMAL_SNAPSHOT } from "../__fixtures__/reportFixtures";
import { shareReportCard } from "../utils/shareReport";
import { buildReportStats } from "../utils/shareStats";

jest.mock("@shopify/react-native-skia", () => ({
  ImageFormat: { PNG: 4 },
  makeImageFromView: jest.fn(),
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

const capture = jest.mocked(makeImageFromView);
const write = jest.mocked(writeAsStringAsync);
const isAvailable = jest.mocked(Sharing.isAvailableAsync);
const shareAsync = jest.mocked(Sharing.shareAsync);

const cardRef = { current: null };
const INPUT = { cardRef, periodKey: "2026-10", message: "My October Broke Report" };

function image(base64 = "AAAA") {
  return { encodeToBase64: jest.fn(() => base64) } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  isAvailable.mockResolvedValue(true);
  shareAsync.mockResolvedValue(undefined);
  write.mockResolvedValue(undefined);
});

describe("shareReportCard", () => {
  it("captures the card, writes a PNG to the cache and opens the share sheet", async () => {
    capture.mockResolvedValueOnce(image("PNGDATA"));
    await expect(shareReportCard(INPUT)).resolves.toBe("shared");
    expect(capture).toHaveBeenCalledWith(cardRef);
    const [uri, contents, options] = write.mock.calls[0];
    expect(uri).toMatch(/^file:\/\/\/cache\/broke-report-2026-10-\d+\.png$/);
    expect(contents).toBe("PNGDATA");
    expect(options).toEqual({ encoding: "base64" });
    expect(shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: "image/png" }));
  });

  it("reports a failed capture (null image) without writing or sharing anything", async () => {
    capture.mockResolvedValueOnce(null);
    await expect(shareReportCard(INPUT)).resolves.toBe("capture_failed");
    expect(write).not.toHaveBeenCalled();
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it("never throws when the capture itself fails", async () => {
    capture.mockRejectedValueOnce(new Error("view gone"));
    await expect(shareReportCard(INPUT)).resolves.toBe("capture_failed");
  });

  it("treats an empty encode or a write failure as a failed capture", async () => {
    capture.mockResolvedValueOnce(image(""));
    await expect(shareReportCard(INPUT)).resolves.toBe("capture_failed");
    capture.mockResolvedValueOnce(image());
    write.mockRejectedValueOnce(new Error("disk full"));
    await expect(shareReportCard(INPUT)).resolves.toBe("capture_failed");
  });

  it("falls back to the system share when expo-sharing is not available", async () => {
    capture.mockResolvedValueOnce(image());
    isAvailable.mockResolvedValueOnce(false);
    const systemShare = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    await expect(shareReportCard(INPUT)).resolves.toBe("shared");
    expect(shareAsync).not.toHaveBeenCalled();
    expect(systemShare).toHaveBeenCalledWith(
      expect.objectContaining({ message: INPUT.message, url: expect.stringContaining("broke-report-") }),
    );
    systemShare.mockRestore();
  });

  it("reports a share sheet that cannot open", async () => {
    capture.mockResolvedValueOnce(image());
    shareAsync.mockRejectedValueOnce(new Error("no activity"));
    await expect(shareReportCard(INPUT)).resolves.toBe("failed");
  });
});

describe("buildReportStats", () => {
  it("leaves rupee amounts off the card by default", () => {
    const stats = buildReportStats(FULL_SNAPSHOT, false);
    expect(stats).toEqual([
      { value: "41", label: "payments" },
      { value: "40%", label: "on Food & Dining" },
      { value: "Fri", label: "busiest weekday" },
    ]);
    expect(JSON.stringify(stats)).not.toContain("₹");
  });

  it("shows amounts when asked", () => {
    expect(buildReportStats(FULL_SNAPSHOT, true)).toEqual([
      { value: "₹18.6k", label: "spent" },
      { value: "41", label: "payments" },
      { value: "₹7.5k", label: "on Food & Dining" },
    ]);
  });

  it("copes with a month that has no category", () => {
    const bare = { ...MINIMAL_SNAPSHOT, categories: [], debit_count: 1 };
    expect(buildReportStats(bare, false)[0]).toEqual({ value: "1", label: "payment" });
    expect(buildReportStats(bare, false)[1]).toEqual({ value: "0", label: "no-spend days" });
    expect(buildReportStats(bare, true)[2]).toEqual({ value: "0", label: "no-spend days" });
  });
});
