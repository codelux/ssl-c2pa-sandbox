import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { rid } from '@/lib/ids';
import { rateLimit } from '@/lib/rateLimit';

// Env shape is validated via getEnv()

const ReqSchema = z.object({
  csr: z.string().min(1),
  profileId: z.string().optional(),
  conformingProductId: z.string().optional(),
  subject: z.object({ CN: z.string().optional(), O: z.string().optional(), C: z.string().optional() }).optional(),
});

export async function POST(req: Request) {
  const reqId = rid();
  try {
    const env = getEnv();
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const limited = rateLimit({ key: `cert:${ip}`, capacity: 30, refillPerSec: 0.5 }); // ~30/min
    if (!limited.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded', reqId }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = ReqSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', reqId }, { status: 400 });
    }

    if (!env.AUTH_TOKEN) {
      // Preview fallback: return a stub certificate so the UI can proceed.
      const stubCert = `-----BEGIN CERTIFICATE-----\n${btoa('preview cert')}\n-----END CERTIFICATE-----`;
      logger.info('Preview stub certificate returned (no secrets configured)', { reqId });
      return NextResponse.json({ certificatePem: stubCert, requestId: reqId });
    }

    // Forward to issuance API
    try {
      // Transform to upstream schema:
      // {
      //   certificate_profile_id,
      //   certificate_signing_request,
      //   conforming_product_id,
      //   experimental: { CN, O, C }
      // }
      const bodyOut: any = {
        certificate_profile_id: parsed.data.profileId || env.CERT_PROFILE_ID,
        certificate_signing_request: parsed.data.csr,
        conforming_product_id: parsed.data.conformingProductId || env.CONFORMING_PRODUCT_ID,
      };
      if (parsed.data.subject) {
        bodyOut.experimental = { ...parsed.data.subject };
      }

      const res = await fetch(`${env.API_BASE}/api/v1/certificate-requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${env.AUTH_TOKEN}`,
        },
        body: JSON.stringify(bodyOut),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        logger.warn('Issuance API error', { reqId, status: res.status });
        return NextResponse.json({ error: json?.error || 'Issuance failed', reqId }, { status: res.status });
      }
      return NextResponse.json({ certificatePem: json.certificatePem, requestId: reqId, meta: json.meta });
    } catch (e: any) {
      logger.error('Issuance forward error', { reqId, error: e?.message || String(e) });
      return NextResponse.json({ error: 'Upstream error', reqId }, { status: 502 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('cert-requests error', { reqId, error: msg });
    return NextResponse.json({ error: 'Server error', reqId }, { status: 500 });
  }
}
