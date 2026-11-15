// react-native-share is a native module: tests that import the nudge share code get this stand-in.
export default { open: jest.fn(() => Promise.resolve({ success: true, message: "" })) };
