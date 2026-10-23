import { createMMKV } from "react-native-mmkv";

import { resetMockMmkv } from "@/test-utils/mockMmkv";

import {
  clearOutboxStorage,
  loadOutboxItems,
  saveOutboxItems,
} from "../outboxStorage";
import { manualItem, voiceItem } from "./fixtures";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const store = () => createMMKV({ id: "dime-outbox" });

describe("outboxStorage", () => {
  beforeEach(() => resetMockMmkv());

  it("keeps each user's items under their own versioned key", () => {
    saveOutboxItems("user-a", [manualItem()]);
    saveOutboxItems("user-b", [voiceItem()]);
    expect(store().getAllKeys().sort()).toEqual(["outbox.v1:user-a", "outbox.v1:user-b"]);
    expect(loadOutboxItems("user-a").map((i) => i.kind)).toEqual(["manual"]);
    expect(loadOutboxItems("user-b").map((i) => i.kind)).toEqual(["voice"]);
    expect(loadOutboxItems("user-c")).toEqual([]);
  });

  it("round-trips an item exactly", () => {
    const item = manualItem({ attempts: 2, nextAttemptAt: 123, lastError: "boom" });
    saveOutboxItems("u", [item]);
    expect(loadOutboxItems("u")).toEqual([item]);
  });

  it("removes the key when the outbox becomes empty", () => {
    saveOutboxItems("u", [manualItem()]);
    saveOutboxItems("u", []);
    expect(store().contains("outbox.v1:u")).toBe(false);
  });

  it("tolerates corrupt JSON and wrong shapes", () => {
    store().set("outbox.v1:u", "{not json");
    expect(loadOutboxItems("u")).toEqual([]);
    store().set("outbox.v1:u", JSON.stringify({ not: "an array" }));
    expect(loadOutboxItems("u")).toEqual([]);
  });

  it("skips items of another version or with a broken shape, keeping the good ones", () => {
    store().set(
      "outbox.v1:u",
      JSON.stringify([
        manualItem(),
        { ...manualItem({ id: "future" }), v: 2 },
        { ...manualItem({ id: "no-body" }), body: undefined },
        { ...voiceItem({ id: "no-file" }), file: undefined },
        { ...manualItem({ id: "bad-status" }), status: "weird" },
        null,
        "text",
      ]),
    );
    expect(loadOutboxItems("u").map((i) => i.id)).toEqual(["optimistic-manual-1"]);
  });

  it("an item left 'sending' by an app kill comes back as queued", () => {
    saveOutboxItems("u", [manualItem({ status: "sending" }), manualItem({ id: "x", status: "failed" })]);
    expect(loadOutboxItems("u").map((i) => i.status)).toEqual(["queued", "failed"]);
  });

  it("clearOutboxStorage drops every user's outbox", () => {
    saveOutboxItems("user-a", [manualItem()]);
    saveOutboxItems("user-b", [voiceItem()]);
    clearOutboxStorage();
    expect(loadOutboxItems("user-a")).toEqual([]);
    expect(loadOutboxItems("user-b")).toEqual([]);
  });
});
