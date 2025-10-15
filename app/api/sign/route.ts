import { NextResponse } from 'next/server';
import { rid } from '@/lib/ids';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, isAbsolute, extname } from 'node:path';
import { spawn } from 'node:child_process';

export const runtime = 'nodejs';

function spawnAsync(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    const bufsOut: Buffer[] = [];
    const bufsErr: Buffer[] = [];
    child.on('error', (err) => {
      bufsErr.push(Buffer.from(String(err)));
      resolve({ code: -1, stdout: Buffer.concat(bufsOut).toString('utf8'), stderr: Buffer.concat(bufsErr).toString('utf8') });
    });
    child.stdout.on('data', (d) => bufsOut.push(Buffer.from(d)));
    child.stderr.on('data', (d) => bufsErr.push(Buffer.from(d)));
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout: Buffer.concat(bufsOut).toString('utf8'), stderr: Buffer.concat(bufsErr).toString('utf8') });
    });
  });
}

export async function POST(req: Request) {
  const reqId = rid('sign_');
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const limited = rateLimit({ key: `sign:${ip}`, capacity: 20, refillPerSec: 0.33 });
  if (!limited.ok) return NextResponse.json({ error: 'Rate limit exceeded', reqId }, { status: 429 });

  try {
    // Accept multipart form with fields: file (binary), manifest (json string), optional: certPem, privateKeyPem
    const form = await req.formData();
    const file = form.get('file');
    const manifestStr = form.get('manifest');
    const certPem = form.get('certPem'); // optional: user's certificate
    const privateKeyPem = form.get('privateKeyPem'); // optional: user's private key

    if (!(file instanceof File) || typeof manifestStr !== 'string') {
      return NextResponse.json({ error: 'Invalid form data', reqId }, { status: 400 });
    }

    const useUserCredentials = typeof certPem === 'string' && typeof privateKeyPem === 'string';

    // Prepare temp workspace
    const tmp = mkdtempSync(join(tmpdir(), 'c2pa-'));
    const originalName = file.name || 'input.jpg';
    const ext = extname(originalName) || '.jpg';
    const inPath = join(tmp, `input${ext}`);
    const outPath = join(tmp, `signed${ext}`);
    const manifestPath = join(tmp, 'manifest.json');
    const certPath = join(tmp, 'cert.pem');
    let keyPath = join(tmp, 'private.key'); // let instead of const so we can update it

    const arr = new Uint8Array(await file.arrayBuffer());
    writeFileSync(inPath, arr);

    // Write user credentials to temp files if provided
    if (useUserCredentials) {
      // Clean up line endings - ensure Unix-style \n instead of \r\n
      const cleanCert = (certPem as string).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const cleanKey = (privateKeyPem as string).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      logger.info('Writing user credentials', {
        reqId,
        certLength: cleanCert.length,
        keyLength: cleanKey.length,
        certPreview: cleanCert.slice(0, 100),
        keyPreview: cleanKey.slice(0, 100)
      });

      writeFileSync(certPath, cleanCert, 'utf8');
      // Write the private key - it's in PKCS#8 format from WebCrypto
      writeFileSync(keyPath, cleanKey, 'utf8');

      // c2patool may need EC format, try to convert using openssl
      const keyPathEC = join(tmp, 'private_ec.key');
      try {
        const convertResult = await spawnAsync('openssl', [
          'ec',
          '-in', keyPath,
          '-out', keyPathEC
        ], tmp);

        if (convertResult.code === 0 && existsSync(keyPathEC)) {
          // Successfully converted, use EC format
          logger.info('Converted PKCS#8 key to EC format', { reqId });
          // Update manifest to use converted key
          keyPath = keyPathEC;
        } else {
          // Conversion failed, stick with PKCS#8
          logger.warn('Could not convert key to EC format, using PKCS#8', { reqId, stderr: convertResult.stderr });
        }
      } catch (e) {
        // openssl not available or failed, use PKCS#8 as-is
        logger.warn('openssl conversion failed, using PKCS#8 key', { reqId, error: String(e) });
      }
    }
    // Transform manifest to c2patool-friendly shape if needed
    try {
      const mRaw: unknown = JSON.parse(manifestStr);

      logger.info('Processing manifest', {
        reqId,
        useUserCredentials,
        hasAssertions: mRaw && typeof mRaw === 'object' && Array.isArray((mRaw as Record<string, unknown>).assertions),
        rawManifestKeys: mRaw && typeof mRaw === 'object' ? Object.keys(mRaw as object) : null
      });

      if (
        mRaw &&
        typeof mRaw === 'object' &&
        Array.isArray((mRaw as Record<string, unknown>).assertions)
      ) {
        const obj = mRaw as { assertions: unknown[]; ta_url?: string } & Record<string, unknown>;

        logger.info('Manifest has assertions', { reqId, hasTaUrl: !!obj.ta_url, taUrl: obj.ta_url });

        // Ensure ta_url is set for timestamping when using user credentials
        if (useUserCredentials && !obj.ta_url) {
          // Try staging TSA first (known working SSL/TLS), fallback to new domain
          obj.ta_url = process.env.TSA_URL || 'https://api.staging.c2pa.ssl.com/v1/timestamp';
          logger.info('Added SSL.com TSA URL to manifest (trying staging first)', { reqId, tsaUrl: obj.ta_url, fallback: 'https://api.c2patool.io/v1/timestamp' });
        }
        obj.assertions = obj.assertions.map((a: unknown) => {
          if (!a || typeof a !== 'object') return a;
          const rec = a as Record<string, unknown>;
          const label = rec.label as string | undefined;
          const hasData = Object.prototype.hasOwnProperty.call(rec, 'data');

          if (label === 'c2pa.actions') {
            // Ensure data.actions is an array of action objects
            let actions: unknown[] = [];
            if (hasData) {
              const data = rec.data as unknown;
              if (data && typeof data === 'object' && Array.isArray((data as any).actions)) actions = (data as any).actions;
              else if (Array.isArray(data)) actions = data;
              else if (data && typeof data === 'object' && (data as any).action) actions = [data];
            } else {
              if (typeof rec.action === 'string') actions = [{ action: rec.action }];
              else if (Array.isArray(rec.actions)) actions = rec.actions;
            }
            return { label, data: { actions } };
          }

          // Generic case: ensure data is an object
          if (!hasData) {
            const { label: _ignore, ...rest } = rec;
            return { label, data: Object.keys(rest).length ? rest : {} };
          }
          return rec;
        });

        // Add user credentials to manifest if provided
        if (useUserCredentials) {
          obj.private_key = keyPath;
          obj.sign_cert = certPath;
        }

        const manifestContent = JSON.stringify(obj, null, 2);
        writeFileSync(manifestPath, manifestContent, 'utf8');
        logger.info('Wrote manifest to file', {
          reqId,
          manifestPath,
          manifestPreview: manifestContent.slice(0, 500)
        });
      } else {
        // If not an object with assertions, parse and add credentials
        let manifestObj = JSON.parse(manifestStr);
        if (useUserCredentials) {
          manifestObj.private_key = keyPath;
          manifestObj.sign_cert = certPath;
          // Ensure SSL.com TSA URL is set
          if (!manifestObj.ta_url) {
            manifestObj.ta_url = process.env.TSA_URL || 'https://api.staging.c2pa.ssl.com/v1/timestamp';
            logger.info('Added SSL.com TSA URL to manifest (simple path, trying staging first)', { reqId, tsaUrl: manifestObj.ta_url, fallback: 'https://api.c2patool.io/v1/timestamp' });
          }
        }
        writeFileSync(manifestPath, JSON.stringify(manifestObj), 'utf8');
      }
    } catch {
      // If parsing fails, try to add credentials anyway
      try {
        let manifestObj = JSON.parse(manifestStr);
        if (useUserCredentials) {
          manifestObj.private_key = keyPath;
          manifestObj.sign_cert = certPath;
          // Ensure SSL.com TSA URL is set
          if (!manifestObj.ta_url) {
            manifestObj.ta_url = process.env.TSA_URL || 'https://api.staging.c2pa.ssl.com/v1/timestamp';
            logger.info('Added SSL.com TSA URL to manifest (fallback path, trying staging first)', { reqId, tsaUrl: manifestObj.ta_url, fallback: 'https://api.c2patool.io/v1/timestamp' });
          }
        }
        writeFileSync(manifestPath, JSON.stringify(manifestObj), 'utf8');
      } catch {
        // Last resort: write as-is
        writeFileSync(manifestPath, manifestStr, 'utf8');
      }
    }

    // Path to c2patool binary (env or default in PATH)
    let c2paTool = process.env.C2PATOOL_PATH || 'c2patool';
    // If caller provided a relative path (e.g., ./c2patool in project root), make it absolute
    if (!isAbsolute(c2paTool)) {
      // Prefer project-root relative resolution
      const candidate = join(process.cwd(), c2paTool);
      if (existsSync(candidate)) {
        c2paTool = candidate;
      }
    }

    // Invoke c2patool to sign using built-in demo cert/key (no private_key/sign_cert in manifest)
    const args = [inPath, '-m', manifestPath, '-o', outPath];
    const trust = process.env.TRUST_ANCHORS_PATH;
    if (trust && existsSync(trust)) {
      args.push('-f', 'trust', '--trust_anchors', trust);
    }

    logger.info('Invoking c2patool', {
      reqId,
      command: c2paTool,
      args,
      cwd: tmp,
      useUserCredentials
    });

    const run = await spawnAsync(c2paTool, args, tmp);

    logger.info('c2patool execution completed', {
      reqId,
      exitCode: run.code,
      outputExists: existsSync(outPath),
      stdout: run.stdout.slice(0, 500),
      stderr: run.stderr.slice(0, 500)
    });

    // Check if SSL.com TSA failed with connection issues - try fallback
    if (run.code !== 0 && run.stderr?.includes('time stamp') && useUserCredentials) {
      const manifestContent = readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // If staging TSA failed, try the new domain as fallback
      if (manifest.ta_url?.includes('api.staging.c2pa.ssl.com')) {
        logger.warn('Staging TSA failed, trying fallback to api.c2patool.io', {
          reqId,
          firstTsaUrl: manifest.ta_url,
          fallbackUrl: 'https://api.c2patool.io/v1/timestamp',
          error: run.stderr.slice(0, 200)
        });

        // Update manifest with fallback TSA URL
        manifest.ta_url = 'https://api.c2patool.io/v1/timestamp';
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        // Retry signing with fallback TSA
        logger.info('Retrying c2patool with fallback TSA', { reqId, tsaUrl: manifest.ta_url });
        const retryRun = await spawnAsync(c2paTool, args, tmp);

        logger.info('c2patool retry completed', {
          reqId,
          exitCode: retryRun.code,
          outputExists: existsSync(outPath),
          stdout: retryRun.stdout.slice(0, 500),
          stderr: retryRun.stderr.slice(0, 500)
        });

        // If retry succeeded, update run to use retry results
        if (retryRun.code === 0 && existsSync(outPath)) {
          logger.info('Fallback TSA succeeded!', { reqId, tsaUrl: manifest.ta_url });
          run.code = retryRun.code;
          run.stdout = retryRun.stdout;
          run.stderr = retryRun.stderr;
        } else {
          logger.error('Both TSAs failed', {
            reqId,
            staging: { url: 'https://api.staging.c2pa.ssl.com/v1/timestamp', error: run.stderr.slice(0, 200) },
            fallback: { url: 'https://api.c2patool.io/v1/timestamp', error: retryRun.stderr.slice(0, 200) }
          });
        }
      } else if (manifest.ta_url?.includes('api.c2patool.io')) {
        logger.error('New domain TSA failed', {
          reqId,
          tsaUrl: manifest.ta_url,
          error: run.stderr,
          note: 'api.c2patool.io TSA endpoint may not be deployed yet. Contact SSL.com team.'
        });
      }
    }

    if (run.code !== 0 || !existsSync(outPath)) {
      logger.error('c2patool sign failed', { reqId, code: run.code, stderr: run.stderr });
      // Clean up temp dir
      try { rmSync(tmp, { recursive: true, force: true }); } catch {}

      let hint = undefined;
      if (run.code === -1 || run.stderr?.includes('ENOENT') || run.stderr?.includes('not found')) {
        hint = `c2patool binary not found or not executable. To use demo mode:
1. Install c2patool: https://github.com/contentauth/c2patool
2. Set C2PATOOL_PATH environment variable to the binary path
3. Ensure it's executable: chmod +x /path/to/c2patool

Alternatively, uncheck "Quick demo mode" to sign with your own certificate and keys (main workflow).

Current C2PATOOL_PATH: ${c2paTool}`;
      } else if (run.stderr?.includes('time stamp') || run.stderr?.includes('timestamp')) {
        if (useUserCredentials) {
          hint = `SSL.com TSA (https://api.c2patool.io/v1/timestamp) is currently unreachable.

Possible solutions:
1. Contact SSL.com team to investigate the TSA connectivity
2. Verify the TSA endpoint is accessible from your network
3. For testing purposes, you can temporarily modify the manifest's ta_url to use a different RFC 3161 compliant TSA

The certificate issuance API is working correctly - only the timestamp service has connectivity issues.`;
        } else {
          hint = `c2patool failed to generate timestamp. This is likely due to network issues or TSA endpoint configuration.

Quick fix: Uncheck "Quick demo mode" to sign with your own certificate and keys instead (the main workflow for this tool).

If you need demo mode, ensure c2patool can reach the TSA endpoints listed in the footer.`;
        }
      }

      return NextResponse.json({ error: 'Signing failed', reqId, detail: run.stderr?.slice(0, 2000), hint }, { status: 500 });
    }

    // Read the signed file as a Buffer (binary data)
    const signedBuffer = readFileSync(outPath);
    logger.info('Read signed file', { reqId, fileSize: signedBuffer.length });

    // Clean up temp dir before returning
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}

    // Infer content-type from input name if possible - sanitize to ASCII only
    const rawContentType = file.type || 'application/octet-stream';
    const ct = rawContentType.replace(/[^\x00-\x7F]/g, '');

    // Convert Buffer to Uint8Array to avoid any encoding issues
    const uint8Array = new Uint8Array(signedBuffer);

    // Sanitize filename to remove any non-ASCII characters
    const safeName = (file.name || 'asset').replace(/[^\x00-\x7F]/g, '_');

    logger.info('Returning signed file', {
      reqId,
      arrayLength: uint8Array.length,
      contentType: ct,
      rawContentType,
      filename: safeName,
      rawFilename: file.name
    });

    // Create response using standard Response API with Uint8Array
    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Content-Disposition': `attachment; filename="signed-${safeName}"`,
        'Content-Length': uint8Array.length.toString()
      }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('sign route error', { reqId, error: msg });
    return NextResponse.json({ error: 'Server error', reqId }, { status: 500 });
  }
}
