type Level = 'debug' | 'info' | 'warn' | 'error';

function redact(value?: string) {
  if (!value) return undefined;
  return value.length <= 8 ? '***' : value.slice(0, 4) + '***' + value.slice(-2);
}

export function log(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {
    level,
    msg,
    ...meta,
    t: new Date().toISOString(),
  };
  // mask common secret fields
  if ('token' in out && typeof out.token === 'string') {
    out.token = redact(out.token as string);
  }
  if ('AUTH_TOKEN' in out && typeof out.AUTH_TOKEN === 'string') {
    out.AUTH_TOKEN = redact(out.AUTH_TOKEN as string);
  }
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out));
  } catch {
    // eslint-disable-next-line no-console
    console.log(level.toUpperCase(), msg, meta);
  }
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => log('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => log('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log('error', m, meta),
};
