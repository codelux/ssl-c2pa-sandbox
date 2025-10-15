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
      // API requires experimental field even though subject is in CSR
      if (parsed.data.subject && (parsed.data.subject.CN || parsed.data.subject.O || parsed.data.subject.C)) {
        bodyOut.experimental = parsed.data.subject;
      } else {
        // Fallback: provide minimal experimental data
        bodyOut.experimental = { CN: 'C2PA Test User' };
      }

      logger.info('Calling SSL.com certificate API', {
        reqId,
        profileId: bodyOut.certificate_profile_id,
        hasConformingProductId: !!bodyOut.conforming_product_id,
        conformingProductId: bodyOut.conforming_product_id,
        requestBody: bodyOut
      });

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
        logger.warn('Issuance API error', {
          reqId,
          status: res.status,
          error: json?.error || json?.message || JSON.stringify(json),
          fullResponse: json,
          sentData: {
            profile: bodyOut.certificate_profile_id,
            hasCSR: !!bodyOut.certificate_signing_request,
            csrLength: bodyOut.certificate_signing_request?.length,
            csrPreview: bodyOut.certificate_signing_request?.slice(0, 100),
            hasSubject: !!bodyOut.experimental,
            subject: bodyOut.experimental
          }
        });
        return NextResponse.json({
          error: json?.error || json?.message || 'Issuance failed',
          detail: JSON.stringify(json).slice(0, 500),
          reqId
        }, { status: res.status });
      }

      // Log successful response to debug certificate field name
      const firstCert = json.certificates?.[0];
      logger.info('Certificate API success', {
        reqId,
        responseKeys: Object.keys(json),
        hasCertificatePem: !!json.certificatePem,
        hasCertificate: !!json.certificate,
        hasCertificates: !!json.certificates,
        certificatesLength: Array.isArray(json.certificates) ? json.certificates.length : 0,
        firstCertType: typeof firstCert,
        firstCertKeys: firstCert && typeof firstCert === 'object' ? Object.keys(firstCert) : null,
        firstCertPreview: typeof firstCert === 'string' ? firstCert.slice(0, 50) : JSON.stringify(firstCert).slice(0, 100)
      });

      // SSL.com API returns { id, certificates: [cert1, cert2, ...] }
      // Extract the first certificate (leaf cert) as PEM
      let certificatePem = json.certificatePem; // Try this first (might be added in future)
      if (!certificatePem && json.certificates && Array.isArray(json.certificates) && json.certificates.length > 0) {
        const cert = json.certificates[0];
        // Check if it's already a string (PEM) or an object with a pem field
        if (typeof cert === 'string') {
          certificatePem = cert;
        } else if (cert && typeof cert === 'object') {
          // Try common field names: pem, certificate, certificatePem, data
          certificatePem = cert.pem || cert.certificate || cert.certificatePem || cert.data;
        }
      }

      if (!certificatePem) {
        logger.error('No certificate found in API response', { reqId, responseKeys: Object.keys(json), firstCert });
        return NextResponse.json({ error: 'No certificate in response', reqId }, { status: 500 });
      }

      return NextResponse.json({ certificatePem, requestId: reqId, meta: json.meta });
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
