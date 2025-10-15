// C2PA helpers backed by the `c2pa` WebAssembly library.
// We use dynamic imports and loose typing to keep integration resilient across minor versions.

type SignOpts = {
  image: File;
  manifestJson: any;
  certificatePem: string;
  privateKeyPem: string; // PKCS#8 in PEM
  tsaUrl?: string;
};

async function loadC2pa() {
  // Dynamic import to avoid SSR issues
  const mod: any = await import('c2pa');
  return (mod?.default ?? mod);
}

function publicC2paAsset(file: string) {
  // We expect WASM/worker assets to be copied into /public/c2pa
  return `/c2pa/${file}`;
}

export async function signImageWithManifest(opts: SignOpts): Promise<Blob> {
  const { image, manifestJson, certificatePem, privateKeyPem, tsaUrl } = opts;
  const c2paMod = await loadC2pa();

  // Try common initialization patterns across c2pa versions
  const wasmCandidates = [
    'toolkit_bg.wasm',
    'c2pa_wasm_bg.wasm',
    'c2pa_wasm.wasm',
  ];
  const workerCandidates = [
    'c2pa.worker.js',
    'c2pa_worker.js',
    'worker.js',
  ];

  let c2pa: any;
  let lastErr: any;
  for (const wasm of wasmCandidates) {
    for (const worker of workerCandidates) {
      try {
        console.log(`[C2PA] Trying to initialize with WASM: ${wasm}, Worker: ${worker}`);
        if (typeof c2paMod.C2pa?.create === 'function') {
          c2pa = await c2paMod.C2pa.create({
            wasmSrc: publicC2paAsset(wasm),
            workerSrc: publicC2paAsset(worker),
          });
          console.log('[C2PA] Successfully initialized using C2pa.create');
        } else if (typeof c2paMod.create === 'function') {
          c2pa = await c2paMod.create({
            wasmSrc: publicC2paAsset(wasm),
            workerSrc: publicC2paAsset(worker),
          });
          console.log('[C2PA] Successfully initialized using create');
        } else {
          // Some versions may work without explicit init
          c2pa = c2paMod;
          console.log('[C2PA] Using module directly (no explicit init)');
        }
        lastErr = null;
        break;
      } catch (e) {
        console.warn(`[C2PA] Failed to initialize with ${wasm}/${worker}:`, e);
        lastErr = e;
      }
    }
    if (c2pa) break;
  }

  if (!c2pa && lastErr) {
    throw new Error(
      'Failed to initialize C2PA. Ensure WASM/worker assets are served under /public/c2pa. ' +
      'Run: npm run copy:c2pa'
    );
  }

  // Build a signer; different versions expose different factories
  const signerOpts: any = {
    privateKeyPem,
    privateKey: privateKeyPem,
    certificatePem,
    certChain: [certificatePem],
    certificateChain: [certificatePem],
    timeAuthorityUrl: tsaUrl,
    timeStampUrl: tsaUrl,
    timestampUrl: tsaUrl,
    taUrl: tsaUrl,
  };

  let signer: any;
  if (typeof c2paMod.Signer?.create === 'function') {
    console.log('[C2PA] Creating signer using Signer.create');
    signer = await c2paMod.Signer.create(signerOpts);
  } else if (typeof c2paMod.createSigner === 'function') {
    console.log('[C2PA] Creating signer using createSigner');
    try {
      signer = await c2paMod.createSigner(signerOpts);
    } catch {
      signer = await c2paMod.createSigner({ privateKey: privateKeyPem, certChain: [certificatePem], timeAuthorityUrl: tsaUrl } as any);
    }
  } else {
    // Fallback: pass signer as a plain object; c2pa.sign may build internally
    console.log('[C2PA] Using plain signer object (no factory method found)');
    signer = signerOpts;
  }
  console.log('[C2PA] Signer created:', signer ? 'success' : 'failed');

  // Ensure manifest has a TSA URL reachable from the browser.
  // Prefer the app's proxy to avoid CORS issues with staging TSA.
  let manifestForSign = manifestJson || {};
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const proxyUrl = origin ? `${origin}/api/tsa/timestamp` : '/api/tsa/timestamp';
    // If ta_url missing or points to external TSA, route through our proxy
    const ta = manifestForSign?.ta_url as string | undefined;
    const needsProxy = !ta || /^https?:\/\//i.test(ta);
    manifestForSign = { ...manifestForSign, ta_url: proxyUrl };
  } catch {
    // ignore
  }

  // Sign
  const attemptErrors: string[] = [];
  function coerceToBlob(anyOut: any): Blob | null {
    if (!anyOut) return null;
    if (anyOut instanceof Blob) return anyOut;
    if (anyOut instanceof ArrayBuffer) return new Blob([anyOut], { type: image.type });
    if (anyOut?.buffer instanceof ArrayBuffer) return new Blob([anyOut.buffer], { type: image.type });
    if (anyOut instanceof Uint8Array) return new Blob([anyOut as Uint8Array<ArrayBuffer>], { type: image.type });
    if (anyOut?.blob instanceof Blob) return anyOut.blob;
    if (anyOut?.file instanceof Blob) return anyOut.file;
    if (anyOut?.signed instanceof Blob) return anyOut.signed;
    if (anyOut?.data instanceof ArrayBuffer) return new Blob([anyOut.data], { type: image.type });
    return null;
  }

  async function trySign(target: any): Promise<Blob | null> {
    if (!target) return null;
    // sign(file, { signer, manifest })
    try {
      if (typeof target.sign === 'function') {
        const out1: any = await target.sign(image, { signer, manifest: manifestForSign });
        const b1 = coerceToBlob(out1);
        if (b1) return b1;
        if (out1?.arrayBuffer) {
          const buf = await out1.arrayBuffer();
          return new Blob([buf], { type: image.type });
        }
      }
    } catch (e: any) {
      attemptErrors.push(e?.message || String(e));
    }
    // sign({ file, signer, manifest })
    try {
      if (typeof target.sign === 'function') {
        const out2: any = await target.sign({ file: image, signer, manifest: manifestForSign });
        const b2 = coerceToBlob(out2);
        if (b2) return b2;
        if (out2?.arrayBuffer) {
          const buf = await out2.arrayBuffer();
          return new Blob([buf], { type: image.type });
        }
      }
    } catch (e: any) {
      attemptErrors.push(e?.message || String(e));
    }
    // sign(manifest, file, signer)
    try {
      if (typeof target.sign === 'function') {
        const out3: any = await target.sign(manifestForSign, image, signer);
        const b3 = coerceToBlob(out3);
        if (b3) return b3;
        if (out3?.arrayBuffer) {
          const buf = await out3.arrayBuffer();
          return new Blob([buf], { type: image.type });
        }
      }
    } catch (e: any) {
      attemptErrors.push(e?.message || String(e));
    }
    return null;
  }

  // Try sign on created instance and on the module itself
  console.log('[C2PA] Attempting to sign using c2pa instance...');
  let blob = await trySign(c2pa);
  if (!blob) {
    console.log('[C2PA] c2pa instance sign failed, trying c2paMod...');
    blob = await trySign(c2paMod);
  }

  // Try writer APIs
  async function tryWriter(factoryOwner: any): Promise<Blob | null> {
    try {
      if (factoryOwner?.Writer?.create) {
        const writer = await factoryOwner.Writer.create({ signer });
        if (writer?.sign) {
          const out = await writer.sign(image, manifestForSign);
          const b = coerceToBlob(out);
          if (b) return b;
        }
      }
    } catch (e: any) {
      attemptErrors.push(e?.message || String(e));
    }
    try {
      if (typeof factoryOwner?.createWriter === 'function') {
        const writer = await factoryOwner.createWriter({ signer });
        if (writer?.sign) {
          const out = await writer.sign(image, manifestForSign);
          const b = coerceToBlob(out);
          if (b) return b;
        }
      }
    } catch (e: any) {
      attemptErrors.push(e?.message || String(e));
    }
    return null;
  }

  if (!blob) {
    console.log('[C2PA] Sign methods failed, trying writer API on c2paMod...');
    blob = await tryWriter(c2paMod);
  }
  if (!blob) {
    console.log('[C2PA] c2paMod writer failed, trying c2pa writer...');
    blob = await tryWriter(c2pa);
  }
  if (blob) {
    console.log('[C2PA] Successfully signed image, returning blob');
    return blob;
  }

  // Fallback: return original image blob if no output recognized
  console.warn('c2pa sign returned an unexpected result shape. Attempts:', attemptErrors);
  const errorDetails = attemptErrors.length > 0
    ? `\n\nAttempt errors:\n${attemptErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
    : '';
  throw new Error(`C2PA sign did not return a Blob${errorDetails}`);
}

export async function verifyAsset(file: File | Blob): Promise<unknown> {
  const c2paMod = await loadC2pa();
  let c2pa: any = c2paMod;
  if (typeof c2paMod.C2pa?.create === 'function') {
    try {
      c2pa = await c2paMod.C2pa.create({ wasmSrc: publicC2paAsset('toolkit_bg.wasm'), workerSrc: publicC2paAsset('c2pa.worker.js') });
    } catch {
      // try using module directly
      c2pa = c2paMod;
    }
  }

  if (typeof c2pa.verify === 'function') {
    return await c2pa.verify(file);
  }
  if (typeof c2pa.read === 'function') {
    return await c2pa.read({ file });
  }
  throw new Error('C2PA verify/read API not found');
}
/* eslint-disable @typescript-eslint/no-explicit-any */
