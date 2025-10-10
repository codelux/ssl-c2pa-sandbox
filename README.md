# C2PA Preview Sandbox

Issue, sign, and verify C2PA content in a preview environment.

## Getting Started

1) Create `.env.local` with values based on `.env.example` (server-only secrets).

2) Install dependencies and run (requires Node 18+):

```
npm install
npm run dev
```

Open http://localhost:3000.

- API docs page: http://localhost:3000/docs

### Adding c2pa (for sign/verify)

- First, check available versions in your environment:

```
npm view c2pa version
```

- Then install a published version (replace X.Y.Z with the version you saw):

```
npm install c2pa@X.Y.Z
```

- If you already have a working version from your prototype, you can pin that exact version.

## Notes

- Keys are generated client-side and kept in memory by default.
- `app/api/cert-requests` forwards to `API_BASE` when `ACCOUNT_ID`/`AUTH_TOKEN` are set; otherwise returns a preview stub certificate to enable the flow.

### Validate your CSR and key locally (macOS)

View CSR details:

```
openssl req -in request.csr.pem -noout -text -verify
```

View private key details (PKCS#8):

```
openssl pkey -in private_key.pk8.pem -noout -text
```

Compare public keys match (they should be identical):

```
openssl req -in request.csr.pem -pubkey -noout > csr.pub
openssl pkey -in private_key.pk8.pem -pubout > key.pub
diff -u csr.pub key.pub || echo "Keys differ"
```

To import into Keychain, macOS prefers a .p12 with a certificate. Once you have a certificate PEM, you can bundle:

```
openssl pkcs12 -export -inkey private_key.pk8.pem -in certificate.pem -out bundle.p12
```
Then double-click `bundle.p12` to import into Keychain.
- `app/api/tsa/timestamp` proxies binary timestamp requests to `TSA_URL` with size limits and rate limiting.
- See `TODO.md` for the implementation plan derived from `SPEC.md`.

## QA

- Quick run: `npm run qa` (lint + typecheck + build)
- Manual checks: see `QA_CHECKLIST.md`

## Cutover Plan (when issuance goes live)

- Set `AUTH_TOKEN` to your account token; no `X-Account-ID` header needed (account is inferred from token)
- Toggle OFF "Use server demo signer (c2patool)" to use the client signer
- Keep TSA URL as staging (or switch to production later)
- The cURL panel shows the exact `certificate-requests` call for integrators

## Environments & Domains

- Local: `http://localhost:3000`
- Preview/Staging API: `API_BASE=https://api.c2patool.io` (example) and `TSA_URL=https://api.staging.c2pa.ssl.com/v1/timestamp`
- Production: to be announced (tool can be extended to issue production certs when ready)

## Security

- Server-only secrets via env (never exposed to client)
- Basic CSP and security headers in `next.config.js`
- In-memory rate limiting: ~30/min per IP for sensitive routes

### Issuance headers

- Use only `Authorization: Bearer <YOUR_ACCOUNT_TOKEN>` and `Content-Type: application/json`.
- `X-Account-ID` header is not required; the account is inferred from the token.

## Optional: Docker-based CLI demo

If you have the `c2patool-demo.zip` from Slack and Docker installed, you can keep the demo alongside this repo without cluttering the app code:

- Unzip the archive into `examples/c2patool-demo/`
- Follow `examples/c2patool-demo/README.md` for build/sign/verify commands

Tip: You can export a manifest from the web app and use it in the demo (`manifest.json`) to compare results.
