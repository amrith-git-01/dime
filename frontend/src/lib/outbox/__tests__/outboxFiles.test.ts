import { deleteAsync, getInfoAsync, readDirectoryAsync } from "expo-file-system/legacy";

import { NOW } from "./fixtures";
import { pruneOrphanOutboxFiles } from "../outboxFiles";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  readDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

const OLD = (NOW - 60 * 60 * 1000) / 1000;
const FRESH = (NOW - 60 * 1000) / 1000;

describe("pruneOrphanOutboxFiles", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes old files no item references and keeps referenced and fresh ones", async () => {
    jest.mocked(readDirectoryAsync).mockResolvedValue(["kept.m4a", "orphan.m4a", "fresh.jpg"]);
    jest.mocked(getInfoAsync).mockImplementation(async (uri: string) => ({
      exists: true,
      uri,
      isDirectory: false,
      size: 1,
      modificationTime: uri.endsWith("fresh.jpg") ? FRESH : OLD,
    }));
    await pruneOrphanOutboxFiles(["file:///docs/outbox/kept.m4a"], NOW);
    expect(deleteAsync).toHaveBeenCalledTimes(1);
    expect(deleteAsync).toHaveBeenCalledWith("file:///docs/outbox/orphan.m4a", { idempotent: true });
  });

  it("does nothing when the folder does not exist", async () => {
    jest.mocked(readDirectoryAsync).mockRejectedValue(new Error("no such directory"));
    await expect(pruneOrphanOutboxFiles([], NOW)).resolves.toBeUndefined();
    expect(deleteAsync).not.toHaveBeenCalled();
  });
});
