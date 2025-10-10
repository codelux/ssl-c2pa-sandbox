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
    // Accept multipart form with fields: file (binary), manifest (json string)
    const form = await req.formData();
    const file = form.get('file');
    const manifestStr = form.get('manifest');
    if (!(file instanceof File) || typeof manifestStr !== 'string') {
      return NextResponse.json({ error: 'Invalid form data', reqId }, { status: 400 });
    }

    // Prepare temp workspace
    const tmp = mkdtempSync(join(tmpdir(), 'c2pa-'));
    const originalName = file.name || 'input.jpg';
    const ext = extname(originalName) || '.jpg';
    const inPath = join(tmp, `input${ext}`);
    const outPath = join(tmp, `signed${ext}`);
    const manifestPath = join(tmp, 'manifest.json');

    const arr = new Uint8Array(await file.arrayBuffer());
    writeFileSync(inPath, arr);
    // Transform manifest to c2patool-friendly shape if needed
    try {
      const mRaw: unknown = JSON.parse(manifestStr);
      if (
        mRaw &&
        typeof mRaw === 'object' &&
        Array.isArray((mRaw as Record<string, unknown>).assertions)
      ) {
        const obj = mRaw as { assertions: unknown[] } & Record<string, unknown>;
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
        writeFileSync(manifestPath, JSON.stringify(obj), 'utf8');
      } else {
        writeFileSync(manifestPath, manifestStr, 'utf8');
      }
    } catch {
      // If parsing fails, write as-is
      writeFileSync(manifestPath, manifestStr, 'utf8');
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
    const run = await spawnAsync(c2paTool, args, tmp);
    if (run.code !== 0 || !existsSync(outPath)) {
      logger.error('c2patool sign failed', { reqId, code: run.code, stderr: run.stderr });
      // Clean up temp dir
      try { rmSync(tmp, { recursive: true, force: true }); } catch {}
      const hint = run.stderr?.includes('ENOENT') ? `c2patool not found or not executable. Set C2PATOOL_PATH to an absolute path to the binary and ensure it is executable (chmod +x). Current value resolved to: ${c2paTool}` : undefined;
      return NextResponse.json({ error: 'Signing failed', reqId, detail: run.stderr?.slice(0, 2000), hint }, { status: 500 });
    }

    const signed = readFileSync(outPath);
    // Infer content-type from input name if possible
    const ct = file.type || 'application/octet-stream';
    const res = new NextResponse(signed, { status: 200, headers: { 'content-type': ct, 'content-disposition': `attachment; filename="signed-${file.name || 'asset'}"` } });
    // Clean up (best-effort)
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('sign route error', { reqId, error: msg });
    return NextResponse.json({ error: 'Server error', reqId }, { status: 500 });
  }
}
