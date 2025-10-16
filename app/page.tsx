"use client";

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { Card } from '@/components/Card';
import { Dropzone } from '@/components/Dropzone';
import { ManifestSchema, Presets } from '@/lib/manifest';
import { generateCsrPem } from '@/lib/csr';
import { verifyAsset } from '@/lib/c2paClient';

type KeyMaterial = {
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
  pkcs8Pem?: string;
  spkiPem?: string;
};

function toPem(type: 'PRIVATE KEY' | 'PUBLIC KEY' | 'EC PRIVATE KEY', data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  const wrapped = b64.replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${type}-----\n${wrapped}\n-----END ${type}-----`;
}

async function exportKeys(kp: CryptoKeyPair): Promise<{ pkcs8Pem: string; ecPem: string; spkiPem: string }> {
  // Export in PKCS#8 format (standard format)
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
  const pkcs8Pem = toPem('PRIVATE KEY', pkcs8);

  // Also export for EC-specific PEM (c2patool may prefer this)
  // PKCS#8 is fine for most tools, but we'll label it correctly
  const ecPem = toPem('PRIVATE KEY', pkcs8);

  const spki = await crypto.subtle.exportKey('spki', kp.publicKey);
  return {
    pkcs8Pem,
    ecPem, // Same as pkcs8Pem but can be relabeled if needed
    spkiPem: toPem('PUBLIC KEY', spki)
  };
}

export default function Page() {
  const [keys, setKeys] = useState<KeyMaterial>({});
  const [status, setStatus] = useState<string>('Keys in memory only • not uploaded');
  const [certPem, setCertPem] = useState<string>('');
  const [csrPem, setCsrPem] = useState<string>('');
  const [manifestJson, setManifestJson] = useState<string>(JSON.stringify(Presets.minimal, null, 2));
  const [manifestError, setManifestError] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [verifyReport, setVerifyReport] = useState<string>('');
  const [showCurl, setShowCurl] = useState<boolean>(false);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [tsaAlgo, setTsaAlgo] = useState<'ecc' | 'rsa'>('ecc');
  // CSR fields - provide defaults for easier testing
  const [subjectCN, setSubjectCN] = useState('C2PA Test User');
  const [subjectO, setSubjectO] = useState('SSL.com');
  const [subjectC, setSubjectC] = useState('US');
  // Profile IDs (RSA/ECC) provided by your VP Eng
  const PROFILES = useMemo(
    () => ([
      { id: '6ba3b70c-38fe-44c3-803f-910c5873d1d6', name: 'RSA C2PA Profile' },
      { id: '764b6cdd-1c1b-4a46-9967-22a112a0b390', name: 'ECC C2PA Profile' },
    ] as const),
    []
  );
  const defaultProfile = (process.env.NEXT_PUBLIC_CERT_PROFILE_ID as string) || PROFILES[1].id; // default ECC
  const [profileId, setProfileId] = useState<string>(defaultProfile);
  const defaultProductId = (process.env.NEXT_PUBLIC_CONFORMING_PRODUCT_ID as string) || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '');
  const [conformingProductId, setConformingProductId] = useState<string>(defaultProductId);

  const haveKeys = !!keys.privateKey && !!keys.publicKey;
  const canSign = haveKeys && !!certPem && !!imageFile && !!keys.pkcs8Pem;
  const [preset, setPreset] = useState<'minimal' | 'editorial'>('minimal');

  const generateKeysAndCsr = useCallback(async () => {
    try {
      setStatus('Generating EC P-256 keypair…');
      toast.loading('Generating keys...', { id: 'keygen' });
      const kp = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      const exported = await exportKeys(kp);
      setKeys({ privateKey: kp.privateKey, publicKey: kp.publicKey, ...exported });

      const csr = await generateCsrPem({
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        subject: { CN: subjectCN || undefined, O: subjectO || undefined, C: subjectC || undefined },
      });
      setCsrPem(csr);
      setStatus('Keys ready in memory • not uploaded');
      toast.success('Keys and CSR generated successfully!', { id: 'keygen' });
    } catch (e: any) {
      setCsrPem('');
      const msg = e?.message || String(e);
      setStatus(`Error: ${msg}`);
      toast.error(`Failed to generate keys: ${msg}`, { id: 'keygen' });
    }
  }, [subjectCN, subjectO, subjectC]);

  const requestCertificate = useCallback(async () => {
    setCertPem('');
    setStatus('Requesting certificate…');
    toast.loading('Requesting certificate from SSL.com...', { id: 'cert' });
    try {
      const res = await fetch('/api/cert-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          csr: csrPem || '---PEM CSR---',
          profileId: profileId || undefined,
          conformingProductId: conformingProductId || undefined,
          subject: { CN: subjectCN || undefined, O: subjectO || undefined, C: subjectC || undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Request failed');
      setCertPem(data.certificatePem || '');
      setStatus('Certificate received');
      toast.success('Certificate received successfully!', { id: 'cert' });
    } catch (e: any) {
      const msg = e.message || String(e);
      setStatus(`Error: ${msg}`);
      toast.error(`Failed to get certificate: ${msg}`, { id: 'cert' });
    }
  }, [csrPem, profileId, conformingProductId, subjectCN, subjectO, subjectC]);

  const onDropImage = useCallback((file: File) => {
    setImageFile(file);
  }, []);

  const signImage = useCallback(async () => {
    if (!imageFile) return;
    try {
      const parsed = JSON.parse(manifestJson);
      const res = ManifestSchema.safeParse(parsed);
      if (!res.success) {
        setManifestError('Invalid manifest');
        toast.error('Invalid manifest JSON');
        return;
      }
      setManifestError('');
      setStatus('Signing image…');
      toast.loading('Signing image...', { id: 'sign' });

      // All signing now happens server-side using c2patool with user credentials
      if (!keys.pkcs8Pem || !certPem) throw new Error('Missing certificate or private key');

      const form = new FormData();
      form.append('file', imageFile);
      form.append('manifest', JSON.stringify(res.data));
      form.append('certPem', certPem);
      form.append('privateKeyPem', keys.pkcs8Pem);

      const resp = await fetch('/api/sign', { method: 'POST', body: form });

      if (!resp.ok) {
        let msg = 'Signing failed';
        let hint = '';
        const ct = resp.headers.get('content-type') || '';
        try {
          if (ct.includes('application/json')) {
            const j = await resp.json();
            msg = j?.detail || j?.error || JSON.stringify(j);
            hint = j?.hint || '';
          } else {
            msg = await resp.text();
          }
        } catch {}
        const fullMsg = hint ? `${msg}\n\n${hint}` : msg;
        throw new Error((fullMsg || '').toString().slice(0, 800));
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'signed-' + (imageFile.name || 'image');
      a.click();
      URL.revokeObjectURL(url);
      setVerifyReport('Signed with your SSL.com certificate');
      setStatus('Image signed successfully');
      toast.success('Image signed and downloaded!', { id: 'sign' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
      const duration = msg.includes('SSL.com') ? 10000 : 6000;
      const displayMsg = msg.length > 300 ? msg.slice(0, 300) + '...' : msg;
      toast.error(`Signing failed:\n\n${displayMsg}`, { id: 'sign', duration, style: { maxWidth: '600px' } });
    }
  }, [imageFile, keys.pkcs8Pem, certPem, manifestJson]);

  const verifyOnly = useCallback(async () => {
    if (!imageFile) return;
    try {
      console.log('[Manifest Inspector] Starting inspection', {
        fileName: imageFile.name,
        fileSize: imageFile.size,
        fileType: imageFile.type,
        timestamp: new Date().toISOString()
      });

      setStatus('Verifying C2PA manifest…');
      toast.loading('Inspecting manifest...', { id: 'verify' });

      console.log('[Manifest Inspector] Calling verifyAsset...');
      const report = await verifyAsset(imageFile);

      console.log('[Manifest Inspector] verifyAsset completed', {
        reportType: typeof report,
        reportKeys: report && typeof report === 'object' ? Object.keys(report) : [],
        reportPreview: JSON.stringify(report).slice(0, 500)
      });

      setVerifyReport(JSON.stringify(report, null, 2));
      setStatus('Inspection complete');
      toast.success('Manifest inspection complete!', { id: 'verify' });

      console.log('[Manifest Inspector] Success - report set');
    } catch (e: any) {
      const msg = e?.message || String(e);
      const stack = e?.stack || 'No stack trace';

      console.error('[Manifest Inspector] ERROR', {
        message: msg,
        errorType: typeof e,
        errorConstructor: e?.constructor?.name,
        errorKeys: e && typeof e === 'object' ? Object.keys(e) : [],
        stack: stack,
        fullError: e
      });

      setStatus(`Verification error: ${msg}`);
      toast.error(`Inspection failed: ${msg}`, { id: 'verify', duration: 8000 });
    }
  }, [imageFile]);

  const imagePreviewUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : ''), [imageFile]);

  const curlCommand = useMemo(() => {
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE as string) || 'https://api.c2patool.io';
    const bodyOut: any = {
      certificate_profile_id: profileId || undefined,
      certificate_signing_request: csrPem || '-----BEGIN CERTIFICATE REQUEST-----\\n...\\n-----END CERTIFICATE REQUEST-----',
      conforming_product_id: conformingProductId || undefined,
    };
    const subj: any = { CN: subjectCN || undefined, O: subjectO || undefined, C: subjectC || undefined };
    if (subj.CN || subj.O || subj.C) bodyOut.experimental = subj;
    const json = JSON.stringify(bodyOut);
    const cmd = [
      `curl --location '${apiBase}/api/v1/certificate-requests' \\`,
      `--header 'Content-Type: application/json' \\`,
      `--header 'Authorization: Bearer 9b049052a999e98dd5c63b480c523c703a9df4d633910310f0b965bc278993ab' \\`,
      `--data '${json}'`,
    ].join('\n');
    return cmd;
  }, [profileId, csrPem, conformingProductId, subjectCN, subjectO, subjectC]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">Developer tool for testing SSL.com C2PA API endpoints. Configure your own credentials or use the shared test token provided.</p>

      {/* Card A — Keys & Certificate */}
      <Card title="Keys & Certificate">
        <p className="text-xs text-gray-500">{status}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50" onClick={generateKeysAndCsr}>
            Generate Keys &amp; CSR
          </button>
          <button className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50" onClick={requestCertificate} disabled={!haveKeys}>
            Request Certificate
          </button>
          <button className="px-3 py-2 rounded border" type="button" onClick={() => setShowCurl((s) => !s)}>
            {showCurl ? 'Hide' : 'Show'} API cURL
          </button>
          {keys.pkcs8Pem && (
            <a
              className="px-3 py-2 rounded border text-blue-700 border-blue-200"
              href={`data:application/x-pem-file;charset=utf-8,${encodeURIComponent(keys.pkcs8Pem)}`}
              download="private_key.pk8.pem"
            >
              Download Private Key
            </a>
          )}
          {certPem && (
            <a
              className="px-3 py-2 rounded border text-blue-700 border-blue-200"
              href={`data:application/x-pem-file;charset=utf-8,${encodeURIComponent(certPem)}`}
              download="certificate.pem"
            >
              Download Cert
            </a>
          )}
          {csrPem && (
            <a
              className="px-3 py-2 rounded border text-blue-700 border-blue-200"
              href={`data:application/pkcs10;charset=utf-8,${encodeURIComponent(csrPem)}`}
              download="request.csr.pem"
            >
              Download CSR
            </a>
          )}
        </div>
        {showCurl && (
          <div className="mt-3">
            <label className="block text-xs text-gray-600 mb-1">Certificate Request — cURL (copy and use in your app)</label>
            <pre className="p-3 bg-gray-50 border rounded text-[12px] whitespace-pre-wrap break-all">{curlCommand}</pre>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded border"
                onClick={() => navigator.clipboard?.writeText(curlCommand)}
              >
                Copy
              </button>
              <span className="text-[11px] text-gray-500">Replace &lt;YOUR_ACCOUNT_TOKEN&gt; with your account token. Shared test token is pre-filled for quick testing.</span>
            </div>
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-600">Subject CN</label>
            <input className="w-full border rounded px-2 py-1" value={subjectCN} onChange={(e) => setSubjectCN(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Subject O</label>
            <input className="w-full border rounded px-2 py-1" value={subjectO} onChange={(e) => setSubjectO(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Subject C</label>
            <input className="w-full border rounded px-2 py-1" value={subjectC} onChange={(e) => setSubjectC(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Profile</label>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {PROFILES.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">Autofills known RSA/ECC profile IDs</p>
          </div>
          <div>
            <label className="block text-xs text-gray-600">Conforming Product ID</label>
            <div className="flex gap-2">
              <input className="w-full border rounded px-2 py-1" value={conformingProductId} onChange={(e) => setConformingProductId(e.target.value)} />
              <button
                type="button"
                className="px-2 py-1 text-xs border rounded"
                onClick={() => setConformingProductId(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '')}
              >
                Random
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Prefill with a random UUID, or paste your own</p>
          </div>
        </div>
      </Card>

      {/* Card B — Image & Manifest */}
      <Card title="Image & Manifest">
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
            <Dropzone onFile={onDropImage} />
            {imagePreviewUrl && (
              <Image src={imagePreviewUrl} alt="preview" width={320} height={240} className="mt-2 rounded border object-contain" />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Manifest JSON</label>
            <textarea
              className="w-full h-40 border rounded p-2 font-mono text-sm"
              value={manifestJson}
              onChange={(e) => setManifestJson(e.target.value)}
            />
            {manifestError && <p className="text-xs text-red-600 mt-1">{manifestError}</p>}
            <div className="mt-2 flex flex-wrap gap-2 items-center">
              <button
                className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50 font-medium"
                disabled={!canSign}
                onClick={signImage}
                title={canSign ? 'Ready to sign' : `Missing: ${!imageFile ? 'image ' : ''}${!haveKeys ? 'keys ' : ''}${!certPem ? 'certificate ' : ''}`}
              >
                {canSign ? 'Sign Image' : '🔒 Sign Image'}
              </button>
              {!canSign && (
                <span className="text-xs text-red-600">
                  {!imageFile && '⚠️ Upload an image first. '}
                  {!haveKeys && '⚠️ Generate keys first. '}
                  {!certPem && '⚠️ Request certificate first. '}
                </span>
              )}
              <button className="px-3 py-2 rounded border" onClick={() => setManifestJson(JSON.stringify(JSON.parse(manifestJson), null, 2))}>Format</button>
              <label className="text-xs text-gray-600">Preset</label>
              <select
                className="px-2 py-2 border rounded text-sm"
                value={preset}
                onChange={(e) => {
                  const v = e.target.value as 'minimal' | 'editorial';
                  setPreset(v);
                  setManifestJson(JSON.stringify(Presets[v], null, 2));
                }}
              >
                <option value="minimal">Minimal</option>
                <option value="editorial">Editorial</option>
              </select>
              <label className="text-xs text-gray-600">TSA</label>
              <select
                className="px-2 py-2 border rounded text-sm"
                value={tsaAlgo}
                onChange={(e) => {
                  const algo = e.target.value as 'ecc' | 'rsa';
                  setTsaAlgo(algo);
                  try {
                    const parsed = JSON.parse(manifestJson);
                    parsed.ta_url = algo === 'rsa'
                      ? 'https://api.c2patool.io/api/v1/timestamps/rsa'
                      : 'https://api.c2patool.io/api/v1/timestamps/ecc';
                    setManifestError('');
                    setManifestJson(JSON.stringify(parsed, null, 2));
                  } catch (err: any) {
                    setManifestError('Invalid JSON; cannot set TSA');
                  }
                }}
              >
                <option value="ecc">ECC (default)</option>
                <option value="rsa">RSA</option>
              </select>
              <button className="px-3 py-2 rounded border" onClick={() => setManifestJson('{}')}>Reset</button>
              <button
                className="px-3 py-2 rounded border"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(manifestJson);
                    const res = ManifestSchema.safeParse(parsed);
                    if (!res.success) throw new Error('Invalid manifest');
                    setManifestError('');
                    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'manifest.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setManifestError(msg || 'Invalid JSON');
                  }
                }}
              >
                Download Manifest
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Card C — Manifest Inspector */}
      <Card title="C2PA Manifest Inspector">
        {/* Disclaimer Banner */}
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-900">
            <strong>⚠️ Developer Tool</strong> — This inspector uses the official C2PA library to read manifest data, but this is not a certified C2PA validator product.
            For production validation, use <a href="https://contentcredentials.org/verify" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Content Credentials Verify</a> or other certified tools.
          </p>
        </div>

        <p className="text-sm text-gray-600 mb-3">Upload a C2PA-signed image to inspect its manifest, assertions, and provenance chain. Great for testing how tampering or modifications affect the signature.</p>

        <div className="mt-3 flex gap-2 items-center">
          <button
            className="px-3 py-2 rounded bg-green-600 text-white font-medium disabled:opacity-50"
            onClick={verifyOnly}
            disabled={!imageFile}
          >
            Inspect Manifest
          </button>
          {verifyReport && (() => {
            try {
              const r = JSON.parse(verifyReport);

              // Determine status from validationResults
              const validationResults = r.validationResults?.activeManifest;
              const hasFailures = validationResults?.failure && validationResults.failure.length > 0;
              const hasInformational = validationResults?.informational && validationResults.informational.length > 0;
              const hasSuccess = validationResults?.success && validationResults.success.length > 0;

              let status = 'unknown';
              if (hasFailures) {
                status = 'error';
              } else if (hasInformational) {
                status = 'warn';
              } else if (hasSuccess) {
                status = 'ok';
              }

              // Fallback to legacy status field
              if (status === 'unknown' && r.status) {
                status = (r.status || '').toLowerCase();
              }

              const cls = status === 'ok' ? 'bg-green-100 text-green-800 border-green-200' : status === 'warn' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-red-100 text-red-800 border-red-200';
              const label = status === 'ok' ? '✓ Valid' : status === 'warn' ? '⚠ Warnings' : status === 'error' ? '✗ Invalid' : 'ℹ Status';
              return <span className={`inline-flex items-center text-xs font-medium rounded px-2 py-1 border ${cls}`}>{label}</span>;
            } catch {
              return null;
            }
          })()}
        </div>

        {verifyReport && (() => {
          try {
            const data = JSON.parse(verifyReport);
            // Handle both camelCase (new c2pa lib) and snake_case (legacy)
            const manifest = data.activeManifest || data.manifests?.[data.active_manifest];

            return (
              <div className="mt-4 space-y-4">
                {/* Pretty UI Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column - Basic Info */}
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 border rounded">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Manifest Details</h3>
                      <div className="space-y-1 text-xs">
                        <div><span className="text-gray-600">Title:</span> <span className="font-mono">{manifest?.title || 'N/A'}</span></div>
                        <div><span className="text-gray-600">Format:</span> <span className="font-mono">{manifest?.format || 'N/A'}</span></div>
                        <div><span className="text-gray-600">Instance ID:</span> <span className="font-mono text-[10px]">{manifest?.instanceId || manifest?.instance_id || 'N/A'}</span></div>
                        <div><span className="text-gray-600">Claim Generator:</span> <span className="font-mono text-[10px]">{manifest?.claimGenerator || manifest?.claim_generator || 'N/A'}</span></div>
                      </div>
                    </div>

                    {(manifest?.signatureInfo || manifest?.signature_info) && (
                      <div className="p-3 bg-gray-50 border rounded">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Signature Info</h3>
                        <div className="space-y-1 text-xs">
                          <div><span className="text-gray-600">Algorithm:</span> <span className="font-mono">{(manifest.signatureInfo || manifest.signature_info)?.alg || 'N/A'}</span></div>
                          <div><span className="text-gray-600">Issuer:</span> <span className="font-mono text-[10px]">{(manifest.signatureInfo || manifest.signature_info)?.issuer || 'N/A'}</span></div>
                          <div><span className="text-gray-600">Common Name:</span> <span className="font-mono text-[10px]">{(manifest.signatureInfo || manifest.signature_info)?.common_name || 'N/A'}</span></div>
                          {((manifest.signatureInfo || manifest.signature_info)?.time) && (
                            <div><span className="text-gray-600">Signed:</span> <span className="font-mono text-[10px]">{(manifest.signatureInfo || manifest.signature_info).time}</span></div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column - Assertions */}
                  <div className="space-y-3">
                    {(manifest?.assertions?.data || manifest?.assertions) && (() => {
                      const assertions = manifest?.assertions?.data || manifest?.assertions;
                      const assertionList = Array.isArray(assertions) ? assertions : [];
                      return assertionList.length > 0 ? (
                        <div className="p-3 bg-gray-50 border rounded">
                          <h3 className="text-sm font-semibold text-gray-700 mb-2">Assertions ({assertionList.length})</h3>
                          <ul className="space-y-1 text-xs">
                            {assertionList.map((assertion: any, idx: number) => (
                              <li key={idx} className="font-mono text-[11px]">
                                • {assertion.label || 'unknown'}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null;
                    })()}

                    {(() => {
                      const validationResults = data.validationResults?.activeManifest;
                      const validationStatus = data.validation_status || data.validationStatus;

                      // Show validation results if available (new format)
                      if (validationResults) {
                        const allResults = [
                          ...(validationResults.success || []).map((r: any) => ({ ...r, type: 'success' })),
                          ...(validationResults.informational || []).map((r: any) => ({ ...r, type: 'info' })),
                          ...(validationResults.failure || []).map((r: any) => ({ ...r, type: 'error' }))
                        ];

                        return allResults.length > 0 ? (
                          <div className="p-3 bg-gray-50 border rounded max-h-64 overflow-y-auto">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Validation Results</h3>
                            <ul className="space-y-1 text-xs">
                              {allResults.map((item: any, idx: number) => {
                                const icon = item.type === 'success' ? '✓' : item.type === 'info' ? 'ℹ' : '✗';
                                const color = item.type === 'success' ? 'text-green-700' : item.type === 'info' ? 'text-amber-700' : 'text-red-600';
                                return (
                                  <li key={idx} className={`font-mono text-[11px] ${color}`}>
                                    {icon} {item.code || item.message || JSON.stringify(item)}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null;
                      }

                      // Fall back to validation_status (legacy format)
                      if (validationStatus && validationStatus.length > 0) {
                        return (
                          <div className="p-3 bg-gray-50 border rounded">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Validation Status</h3>
                            <ul className="space-y-1 text-xs">
                              {validationStatus.map((item: any, idx: number) => {
                                const isError = item.code?.toLowerCase().includes('error') || item.code?.toLowerCase().includes('fail');
                                return (
                                  <li key={idx} className={`font-mono text-[11px] ${isError ? 'text-red-600' : 'text-gray-700'}`}>
                                    {isError ? '✗' : '•'} {item.code || item.message || JSON.stringify(item)}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>
                </div>

                {/* Collapsible Raw JSON */}
                <div className="border-t pt-3">
                  <button
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="text-sm text-gray-600 hover:text-gray-900 underline"
                  >
                    {showRawJson ? '▼ Hide Raw JSON' : '▶ Show Raw JSON'}
                  </button>
                  {showRawJson && (
                    <pre className="mt-2 whitespace-pre-wrap text-[11px] bg-gray-50 border rounded p-3 max-h-96 overflow-y-auto font-mono">
                      {verifyReport}
                    </pre>
                  )}
                </div>
              </div>
            );
          } catch {
            return (
              <pre className="mt-3 whitespace-pre-wrap text-sm bg-gray-50 border rounded p-3">{verifyReport}</pre>
            );
          }
        })()}
      </Card>

      <footer className="text-xs text-gray-500 mt-8">
        <p>SSL.com C2PA Developer Tool • Test certificate issuance, signing, and verification APIs</p>
        <p className="mt-2">
          <strong>TSA Endpoints (C2PA Compliant):</strong><br />
          ECC (default): <code className="bg-gray-100 px-1 rounded">https://api.c2patool.io/api/v1/timestamps/ecc</code><br />
          RSA: <code className="bg-gray-100 px-1 rounded">https://api.c2patool.io/api/v1/timestamps/rsa</code>
        </p>
        <p className="mt-2">
          <strong>Trust Bundles:</strong><br />
          ECC: <code className="bg-gray-100 px-1 rounded">https://api.c2patool.io/repository/C2PA-ECC-TRUST-BUNDLE.pem</code><br />
          RSA: <code className="bg-gray-100 px-1 rounded">https://api.c2patool.io/repository/C2PA-RSA-TRUST-BUNDLE.pem</code>
        </p>
      </footer>
    </div>
  );
}
