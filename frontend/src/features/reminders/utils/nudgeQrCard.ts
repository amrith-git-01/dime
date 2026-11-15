import {
  FontWeight,
  ImageFormat,
  Skia,
  TextAlign,
  type SkCanvas,
  type SkColor,
} from "@shopify/react-native-skia";
import {
  cacheDirectory,
  deleteAsync,
  readDirectoryAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import qrcodeGenerator from "qrcode-generator";

import { qrCardPalette } from "@/constants/qrCardPalette";

export type NudgeQrCardInput = {
  /** The `upi://pay` address the QR carries. */
  payload: string;
  /** "Pay ₹800 to Amrith". */
  title: string;
  /** The payment note, e.g. "Dinner split (due 5 Nov)". */
  note: string;
  upiId: string;
};

const WIDTH = 1080;
const MARGIN = 72;
const QR_TARGET = 800;
/** Modules of empty space around the code (the QR standard asks for four). */
const QUIET_MODULES = 4;
/**
 * One file per card (`nudge-qr-<time>.png`): the receiving app reads the file after the share sheet
 * closes, so a fixed name could hand an earlier recipient a later card, and apps cache by file URI.
 * Cards older than an hour are deleted on the next write so the cache does not fill up.
 */
const FILE_PREFIX = "nudge-qr-";
const KEEP_MS = 60 * 60 * 1000;

async function deleteOldCards(directory: string, now: number): Promise<void> {
  try {
    const names = await readDirectoryAsync(directory);
    await Promise.all(
      names
        .filter((name) => {
          const match = /^nudge-qr-(\d+)\.png$/.exec(name);
          return match !== null && now - Number(match[1]) > KEEP_MS;
        })
        .map((name) => deleteAsync(`${directory}${name}`, { idempotent: true })),
    );
  } catch {
    // Cleanup is best effort.
  }
}
const FONT_FAMILIES = ["Roboto", "Helvetica Neue", "sans-serif"];

const BACKGROUND = qrCardPalette.background;
const INK = qrCardPalette.ink;
const MUTED = qrCardPalette.muted;

function paragraph(text: string, color: string, size: number, weight: FontWeight, maxLines: number) {
  const built = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Center, maxLines, ellipsis: "..." })
    .pushStyle({
      color: Skia.Color(color),
      fontSize: size,
      fontFamilies: FONT_FAMILIES,
      fontStyle: { weight },
    })
    .addText(text)
    .pop()
    .build();
  built.layout(WIDTH - MARGIN * 2);
  return built;
}

function fill(canvas: SkCanvas, color: SkColor, x: number, y: number, w: number, h: number, radius = 0) {
  const paint = Skia.Paint();
  paint.setColor(color);
  const rect = Skia.XYWHRect(x, y, w, h);
  if (radius > 0) {
    canvas.drawRRect(Skia.RRectXY(rect, radius, radius), paint);
  } else {
    paint.setAntiAlias(false);
    canvas.drawRect(rect, paint);
  }
}

/**
 * Draws the QR card with Skia on an offscreen surface (no mounted view) and returns the PNG as
 * base64; null when the surface or the encode is not available. Light card, dark modules, a quiet
 * zone, and about 10 pixels per module so a phone camera or a gallery scanner reads it.
 */
export function renderNudgeQrCard(input: NudgeQrCardInput): string | null {
  const qr = qrcodeGenerator(0, "M");
  qr.addData(input.payload);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.max(1, Math.floor(QR_TARGET / (count + QUIET_MODULES * 2)));
  const panel = cell * (count + QUIET_MODULES * 2);

  const title = paragraph(input.title, INK, 68, FontWeight.Bold, 2);
  const note = paragraph(input.note, MUTED, 42, FontWeight.Medium, 3);
  const scan = paragraph("Scan with any UPI app", INK, 46, FontWeight.SemiBold, 1);
  const upi = paragraph(`UPI ID: ${input.upiId}`, MUTED, 38, FontWeight.Medium, 2);

  const gap = 40;
  const titleY = MARGIN;
  const noteY = titleY + title.getHeight() + 16;
  const panelY = noteY + note.getHeight() + gap;
  const scanY = panelY + panel + gap;
  const upiY = scanY + scan.getHeight() + 12;
  const height = Math.ceil(upiY + upi.getHeight() + MARGIN);

  const surface = Skia.Surface.MakeOffscreen(WIDTH, height);
  if (!surface) {
    return null;
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color(BACKGROUND));

  title.paint(canvas, MARGIN, titleY);
  note.paint(canvas, MARGIN, noteY);

  const white = Skia.Color(qrCardPalette.panel);
  const panelX = (WIDTH - panel) / 2;
  fill(canvas, white, panelX, panelY, panel, panel, 32);
  const dark = Skia.Color(qrCardPalette.module);
  const origin = QUIET_MODULES * cell;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        fill(canvas, dark, panelX + origin + col * cell, panelY + origin + row * cell, cell, cell);
      }
    }
  }

  scan.paint(canvas, MARGIN, scanY);
  upi.paint(canvas, MARGIN, upiY);

  surface.flush();
  const base64 = surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG, 100);
  return base64 || null;
}

/** Writes the QR card to the cache and returns its `file://` address; null when it cannot be made. Never throws. */
export async function writeNudgeQrCard(input: NudgeQrCardInput): Promise<string | null> {
  try {
    if (!cacheDirectory) {
      return null;
    }
    const base64 = renderNudgeQrCard(input);
    if (!base64) {
      return null;
    }
    const now = Date.now();
    await deleteOldCards(cacheDirectory, now);
    const uri = `${cacheDirectory}${FILE_PREFIX}${now}.png`;
    await writeAsStringAsync(uri, base64, { encoding: "base64" });
    return uri;
  } catch {
    return null;
  }
}
