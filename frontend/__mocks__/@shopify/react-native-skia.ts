// Skia is native (and untransformed ESM) in jest: tests that only import code which draws with it
// get this stand-in. Tests that exercise the drawing mock the module themselves.
export const Skia = {};
export const FontWeight = {};
export const ImageFormat = {};
export const TextAlign = {};
