/**
 * Lazy WASM wrapper around libpg-query (the real PostgreSQL parser, PG 17 grammar).
 *
 * The package's own loader reads the .wasm from disk (`fs`), which does not exist in workerd, so
 * this talks to the Emscripten module directly: the .wasm is imported as a precompiled
 * `WebAssembly.Module` and handed to Emscripten through `instantiateWasm`. Both imports are dynamic,
 * so the ~1.1 MB module is only evaluated on the first agent request; every other route keeps its
 * normal cold start.
 */

export interface PgNode {
  [kind: string]: unknown;
}

export interface PgParseResult {
  version: number;
  stmts: { stmt: PgNode; stmt_location?: number; stmt_len?: number }[];
}

interface PgModule {
  _malloc(n: number): number;
  _free(ptr: number): void;
  _wasm_parse_query_raw(ptr: number): number;
  _wasm_free_parse_result(ptr: number): void;
  lengthBytesUTF8(s: string): number;
  stringToUTF8(s: string, ptr: number, max: number): void;
  UTF8ToString(ptr: number): string;
  getValue(ptr: number, type: 'i32'): number;
}

export class SqlSyntaxError extends Error {
  override name = 'SqlSyntaxError';
}

let modulePromise: Promise<PgModule> | undefined;

/**
 * The Emscripten loader sniffs its host at start-up (`process.versions.node` -> read the .wasm with
 * `fs`; `WorkerGlobalScope` -> `self.location.href`, which workerd does not have). Neither applies:
 * the module is handed to it through `instantiateWasm`. The detection runs synchronously when the
 * async factory is called (before its first await), so hiding those globals for exactly that
 * synchronous window makes the loader pick its plain "shell" path. Nothing else can run meanwhile
 * (single-threaded), and the globals are restored before the call returns.
 */
const HIDDEN_GLOBALS = ['process', 'WorkerGlobalScope', 'window'] as const;

function withoutHostGlobals<T>(fn: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = HIDDEN_GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  try {
    for (const [name] of saved) Object.defineProperty(g, name, { value: undefined, configurable: true, writable: true });
    return fn();
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(g, name, descriptor);
      else delete g[name];
    }
  }
}

function load(): Promise<PgModule> {
  modulePromise ??= (async () => {
    const [{ default: wasm }, glue] = await Promise.all([
      import('libpg-query/wasm/libpg-query.wasm'),
      import('libpg-query/wasm/libpg-query.js'),
    ]);
    const factory = (glue.default ?? glue) as (arg: object) => Promise<PgModule>;
    return withoutHostGlobals(() =>
      factory({
        instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) {
          void WebAssembly.instantiate(wasm, imports).then(done);
          return {};
        },
      }),
    );
  })().catch((err: unknown) => {
    modulePromise = undefined; // allow a retry on the next request
    throw err;
  });
  return modulePromise;
}

/** Parse `sql` with the PostgreSQL grammar. Throws `SqlSyntaxError` with Postgres' own message. */
export async function parseSql(sql: string): Promise<PgParseResult> {
  const mod = await load();
  const len = mod.lengthBytesUTF8(sql) + 1;
  const queryPtr = mod._malloc(len);
  let resultPtr = 0;
  try {
    mod.stringToUTF8(sql, queryPtr, len);
    resultPtr = mod._wasm_parse_query_raw(queryPtr);
    if (!resultPtr) throw new Error('Failed to parse query: memory allocation failed');
    const treePtr = mod.getValue(resultPtr, 'i32');
    const errorPtr = mod.getValue(resultPtr + 8, 'i32');
    if (errorPtr) {
      const messagePtr = mod.getValue(errorPtr, 'i32');
      throw new SqlSyntaxError(messagePtr ? mod.UTF8ToString(messagePtr) : 'syntax error');
    }
    if (!treePtr) throw new SqlSyntaxError('No parse tree generated');
    return JSON.parse(mod.UTF8ToString(treePtr)) as PgParseResult;
  } finally {
    mod._free(queryPtr);
    if (resultPtr) mod._wasm_free_parse_result(resultPtr);
  }
}
