import { AsyncLocalStorage } from 'node:async_hooks';

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

interface LogContext {
  requestId: string;
}

/** Request-scoped context so `log.*` anywhere (services, repositories) tags the request id. */
export const logContext = new AsyncLocalStorage<LogContext>();

function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    const out: Fields = { name: err.name, message: err.message, stack: err.stack };
    if (err.cause !== undefined) out.cause = serializeError(err.cause);
    return out;
  }
  return { message: String(err) };
}

function emit(level: Level, msg: string, fields?: Fields): void {
  const entry: Fields = { level, msg, requestId: logContext.getStore()?.requestId, ...fields };
  // Single-line JSON: Workers Logs indexes the fields.
  const line = JSON.stringify(entry, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: Fields) => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
  /** Pass the caught value as `err`; it is serialized (name, message, stack, cause). */
  error: (msg: string, fields?: Fields & { err?: unknown }) => {
    if (fields && 'err' in fields) {
      const { err, ...rest } = fields;
      emit('error', msg, { ...rest, error: serializeError(err) });
    } else {
      emit('error', msg, fields);
    }
  },
};
