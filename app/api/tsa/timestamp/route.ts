import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/http';
import { rid } from '@/lib/ids';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const reqId = rid('tsa_');
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const limited = rateLimit({ key: `tsa:${ip}`, capacity: 30, refillPerSec: 0.5 });
  if (!limited.ok) return NextResponse.json({ error: 'Rate limit exceeded', reqId }, { status: 429 });

  const env = getEnv();
  if (!env.TSA_URL) {
    return NextResponse.json({ error: 'TSA not configured in preview', reqId }, { status: 501 });
  }

  const len = Number(req.headers.get('content-length') || '0');
  const MAX = 10 * 1024 * 1024; // 10MB
  if (len > MAX) return NextResponse.json({ error: 'Payload too large', reqId }, { status: 413 });

  const ct = req.headers.get('content-type') || '';
  // Allow binary timestamp requests; adjust if TSA requires specific type
  const allowed = ['application/timestamp-query', 'application/octet-stream'];
  if (!allowed.includes(ct)) {
    return NextResponse.json({ error: 'Unsupported content-type', reqId }, { status: 415 });
  }

  const body = await req.arrayBuffer();
  try {
    const res = await fetchWithTimeout(env.TSA_URL, {
      method: 'POST',
      headers: { 'content-type': ct },
      body: body as any,
      timeoutMs: 10000,
    });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('tsa proxy error', { reqId, error: msg });
    return NextResponse.json({ error: 'TSA proxy error', reqId }, { status: 502 });
  }
}
