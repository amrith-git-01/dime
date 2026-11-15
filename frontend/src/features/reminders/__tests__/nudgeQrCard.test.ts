import { deleteAsync, readDirectoryAsync, writeAsStringAsync } from "expo-file-system/legacy";

import { renderNudgeQrCard, writeNudgeQrCard } from "../utils/nudgeQrCard";

const mockAddData = jest.fn();
jest.mock("qrcode-generator", () => {
  const actual = jest.requireActual("qrcode-generator");
  return {
    __esModule: true,
    default: (type: number, level: string) => {
      const qr = actual(type, level);
      const add = qr.addData.bind(qr);
      qr.addData = (data: string) => {
        mockAddData(data);
        add(data);
      };
      return qr;
    },
  };
});

const mockSkia = {
  rects: [] as unknown[],
  texts: [] as string[],
  surface: null as unknown,
  size: [0, 0] as number[],
};
jest.mock("@shopify/react-native-skia", () => {
  const paragraphBuilder = () => {
    let text = "";
    const builder = {
      pushStyle: () => builder,
      addText: (t: string) => {
        text = t;
        return builder;
      },
      pop: () => builder,
      build: () => ({
        layout: jest.fn(),
        getHeight: () => 60,
        paint: () => mockSkia.texts.push(text),
      }),
    };
    return builder;
  };
  const canvas = {
    clear: jest.fn(),
    drawRect: (rect: unknown) => mockSkia.rects.push(rect),
    drawRRect: jest.fn(),
  };
  return {
    FontWeight: { Medium: 500, SemiBold: 600, Bold: 700 },
    ImageFormat: { PNG: 4 },
    TextAlign: { Center: 2 },
    Skia: {
      Color: (c: string) => c,
      Paint: () => ({ setColor: jest.fn(), setAntiAlias: jest.fn() }),
      XYWHRect: (x: number, y: number, w: number, h: number) => ({ x, y, w, h }),
      RRectXY: (rect: unknown) => rect,
      ParagraphBuilder: { Make: paragraphBuilder },
      Surface: {
        MakeOffscreen: (w: number, h: number) => {
          mockSkia.size = [w, h];
          return mockSkia.surface;
        },
      },
    },
    __canvas: canvas,
  };
});
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  deleteAsync: jest.fn(() => Promise.resolve()),
}));

const write = jest.mocked(writeAsStringAsync);

const PAYLOAD = "upi://pay?pa=me@okbank&pn=Amrith&am=800.00&cu=INR&tn=Dinner%20split";
const INPUT = { payload: PAYLOAD, title: "Pay ₹800 to Amrith", note: "Dinner split", upiId: "me@okbank" };

function makeSurface(base64 = "PNGDATA") {
  const { __canvas } = jest.requireMock("@shopify/react-native-skia");
  return {
    getCanvas: () => __canvas,
    flush: jest.fn(),
    makeImageSnapshot: () => ({ encodeToBase64: jest.fn(() => base64) }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSkia.rects = [];
  mockSkia.texts = [];
  mockSkia.surface = makeSurface();
});

describe("renderNudgeQrCard", () => {
  it("encodes exactly the upi:// address into the QR code and returns the PNG", () => {
    expect(renderNudgeQrCard(INPUT)).toBe("PNGDATA");
    expect(mockAddData).toHaveBeenCalledWith(PAYLOAD);
  });

  it("is a 1080 px card whose QR modules are big enough to scan", () => {
    renderNudgeQrCard(INPUT);
    expect(mockSkia.size[0]).toBe(1080);
    const modules = mockSkia.rects as { w: number; h: number }[];
    expect(modules.length).toBeGreaterThan(100);
    // The first rects are the dark modules (the white panel goes through drawRRect).
    const cell = modules[0]!.w;
    expect(cell).toBeGreaterThanOrEqual(10);
    expect(modules.every((rect) => rect.w === cell && rect.h === cell)).toBe(true);
  });

  it("writes the title, the note, the hint and the UPI ID on the card", () => {
    renderNudgeQrCard(INPUT);
    expect(mockSkia.texts).toEqual([
      "Pay ₹800 to Amrith",
      "Dinner split",
      "Scan with any UPI app",
      "UPI ID: me@okbank",
    ]);
  });

  it("is null when no surface can be made or the encode is empty", () => {
    mockSkia.surface = null;
    expect(renderNudgeQrCard(INPUT)).toBeNull();
    mockSkia.surface = makeSurface("");
    expect(renderNudgeQrCard(INPUT)).toBeNull();
  });
});

describe("writeNudgeQrCard", () => {
  it("writes a new file per card and deletes cards older than an hour", async () => {
    const now = 1_800_000_000_000;
    const spy = jest.spyOn(Date, "now").mockReturnValue(now);
    jest
      .mocked(readDirectoryAsync)
      .mockResolvedValueOnce([
        `nudge-qr-${now - 2 * 60 * 60 * 1000}.png`,
        `nudge-qr-${now - 60 * 1000}.png`,
        "report-share.png",
      ]);
    await expect(writeNudgeQrCard(INPUT)).resolves.toBe(`file:///cache/nudge-qr-${now}.png`);
    expect(write.mock.calls[0]![1]).toBe("PNGDATA");
    expect(write.mock.calls[0]![2]).toEqual({ encoding: "base64" });
    expect(jest.mocked(deleteAsync).mock.calls.map(([uri]) => uri)).toEqual([
      `file:///cache/nudge-qr-${now - 2 * 60 * 60 * 1000}.png`,
    ]);
    spy.mockRestore();
  });

  it("is null, never a throw, when drawing or writing fails", async () => {
    mockSkia.surface = null;
    await expect(writeNudgeQrCard(INPUT)).resolves.toBeNull();
    mockSkia.surface = makeSurface();
    write.mockRejectedValueOnce(new Error("disk full"));
    await expect(writeNudgeQrCard(INPUT)).resolves.toBeNull();
  });
});
