# C2PA Sandbox — TODOs

## MVP — End-to-End Happy Path

- [x] Keys: Generate EC P-256 keypair in browser (WebCrypto)
 - [x] CSR: Create CSR client-side (pkijs) and PEM export
- [x] API: `/api/cert-requests` proxy scaffold with stubs + env validation
- [ ] Manifest editor: JSON textarea + presets + validation
- [x] Manifest editor: JSON textarea + presets + minimal schema validation
- [ ] Sign: Embed manifest + sign image (c2pa-js + WASM)
- [x] TSA: Use staging TSA; fallback to `/api/tsa/timestamp` proxy
- [ ] Verify: Show human-readable report (claims, TSA, chain, warnings)
- [ ] Download: private key (PKCS#8), certificate (PEM), signed asset, manifest
  - [x] Private key download
  - [x] Certificate download (stub)
  - [x] Manifest download
  - [ ] Signed asset download (using c2pa-js)

## UX / Branding

- [ ] Header with logo + “C2PA Preview Sandbox” badge
- [ ] Three-card layout: Keys/Cert, Image/Manifest, Verify
- [ ] Accessibility: keyboard nav, ARIA for drop zone, contrast
  - [x] Drop zone ARIA + keyboard
- [ ] Copy: preview disclaimers; status pill “Keys in memory only”

## Security & Privacy

- [ ] Server-only secrets (DO App Platform): `ACCOUNT_ID`, `AUTH_TOKEN`, `API_BASE`
- [x] Strict CSP and security headers (baseline)
- [x] Rate limit `/api/cert-requests` and `/api/tsa/*`
- [x] Size limits on TSA proxy (10 MB)

## API Integrations

- [ ] Define request/response schemas and error shapes
- [x] Mask secrets in logs; correlation IDs
- [ ] Environments & domains matrix (local, staging, preview)

## Deployment & Ops

- [ ] DO App Platform config (Node version, build/start commands)
- [ ] `.env.example` + docs for required env vars
- [ ] Serve WASM with correct headers; cache static assets

## Testing

- [ ] Fixtures: sample image + sample manifest
- [ ] E2E: issue → sign → verify (mock TSA)
- [ ] Failure paths: TSA down, oversized file, invalid CSR

## Later / Nice-to-Have

- [ ] Encrypted localStorage toggle (off by default)
- [ ] Import existing manifest, re-sign flow improvements
- [ ] Visual verify diff; link trust bundle details
