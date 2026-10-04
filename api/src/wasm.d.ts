declare module '*.wasm' {
  const wasm: WebAssembly.Module;
  export default wasm;
}
declare module 'libpg-query/wasm/libpg-query.js' {
  const factory: unknown;
  export default factory;
}
