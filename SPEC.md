# C2PA Developer Tool — Technical Spec

## Overview

This is a lightweight web-based developer tool that provides a frontend for testing SSL.com's C2PA certificate issuance, signing, and verification API endpoints. It allows developers to experiment with the full C2PA workflow—from generating keypairs and CSRs to signing images with manifests and verifying provenance—all with pretty-printed output for debugging.

**Audience:** Developers, integrators, and partners evaluating SSL.com's C2PA APIs.

## Goals

- **Lightweight UI** for testing SSL.com's C2PA developer API endpoints
- **Browser-based key generation** (EC P-256) and CSR creation
- **Certificate issuance** via SSL.com's API
- **Manifest editing** with JSON presets and live validation
- **Image signing** with C2PA manifests and TSA timestamps
- **Verification** with pretty-printed assertion and manifest data
- **Download capabilities** for keys, certificates, CSRs, and signed assets
- **cURL command display** for easy API integration into production apps

## Non-Goals

- Multi-tenant accounts, RBAC, or billing
- Long-term storage of user assets or keys
- Production-grade deployment infrastructure (this is a simple developer tool)
- Complex sandbox environment management

## User Stories

### 1. Issue & Sign
1. Generate EC P-256 keypair and CSR in browser
2. Request C2PA certificate from SSL.com API (using shared test token or own credentials)
3. Upload an image (PNG/JPEG)
4. Edit manifest JSON (use presets or write custom assertions)
5. Sign image with certificate and TSA timestamp
6. Verify and view pretty-printed output
7. Download signed image, private key, and certificate

### 2. Verify Only
1. Upload a signed image
2. Click Verify
3. View pretty-printed claims, timestamp info, and trust chain

### 3. API Integration
1. Generate keys and CSR
2. View the cURL command showing how to call the certificate issuance API
3. Copy cURL command and integrate into own application

## Architecture

### Frontend
- **Next.js** (App Router) + React
- **Tailwind CSS** for styling
- **WebCrypto** for EC P-256 keypair generation (client-side)
- **pkijs** for CSR generation in browser
- **c2pa-js** for C2PA signing and verification (WASM-based)

### Backend (Minimal)
- **Next.js API routes** for:
  - `/api/cert-requests` - Proxies CSR to SSL.com certificate issuance API
  - `/api/tsa/timestamp` - Optional TSA proxy (if CORS issues)
  - `/api/sign` - Optional demo signing using c2patool binary (quick demo mode)

### Storage
- **Client-side only** - Keys and manifests in browser memory
- **No server persistence** - Files processed in memory only
- **Optional localStorage** for convenience (disabled by default)

## API Integration

### Certificate Issuance (SSL.com API)

**Endpoint:** `POST https://api.c2patool.io/api/v1/certificate-requests`

**Headers:**
```
Authorization: Bearer <YOUR_ACCOUNT_TOKEN>
Content-Type: application/json
```

**Note:** The `X-Account-ID` header is **not required**. Account is inferred from the Bearer token.

**Request Body:**
```json
{
  "certificate_profile_id": "764b6cdd-1c1b-4a46-9967-22a112a0b390",
  "certificate_signing_request": "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----",
  "conforming_product_id": "f5ac57ef-428e-4a82-8852-7bde10b33060",
  "experimental": {
    "CN": "Demo Certificate CN",
    "O": "SSL.com Corporation",
    "C": "US"
  }
}
```

**Response:**
```json
{
  "certificatePem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "requestId": "req_xxx"
}
```

### Profile IDs
- **RSA Profile:** `6ba3b70c-38fe-44c3-803f-910c5873d1d6`
- **ECC Profile:** `764b6cdd-1c1b-4a46-9967-22a112a0b390` (default)

### TSA Endpoints
- **ECC (default):** `https://api.c2patool.io/v1/timestamp`
- **RSA:** `https://api.c2patool.io/v1/timestamp/rsa`

## UI Components

### Card A: Keys & Certificate
- Generate Keys & CSR button
- Request Certificate button
- Download Private Key, Certificate, and CSR buttons
- Show/Hide API cURL toggle
- Input fields for subject CN, O, C
- Profile dropdown (RSA/ECC)
- Conforming Product ID field with random UUID generator
- Status indicator (e.g., "Keys in memory only • not uploaded")

### Card B: Image & Manifest
- Drag-and-drop image upload
- Image preview
- Manifest JSON textarea with syntax highlighting
- Preset dropdown (Minimal, Editorial)
- TSA dropdown (ECC, RSA)
- Sign Image button
- Format JSON button
- Download Manifest button
- Quick demo mode checkbox (uses c2patool if configured)

### Card C: Verify
- Verify button
- Status badge (Pass/Warning/Fail)
- Pretty-printed verification report with assertions, timestamp, and chain info

### Footer
- Links to TSA endpoints and trust bundles
- Developer tool branding

## Security & Privacy

- **Client-side key generation** - Private keys never leave the browser
- **No server storage** - Keys and assets processed in memory only
- **Shared test token** - Pre-filled for quick testing (users can replace with own token)
- **Rate limiting** - ~30/min per IP on API routes
- **CSP & Security Headers** - Configured in `next.config.js`

## Testing Workflow

1. **Generate Keys & CSR** - Browser generates EC P-256 keypair
2. **Request Certificate** - Tool calls `/api/cert-requests` which proxies to SSL.com API
3. **Upload Image** - User drags PNG/JPEG into dropzone
4. **Edit Manifest** - User selects preset or writes custom JSON
5. **Sign Image** - Tool uses c2pa-js (or c2patool in demo mode) to embed manifest
6. **Verify** - Tool verifies signature and displays pretty-printed output
7. **Download** - User saves private key, certificate, and signed image

## Optional: Quick Demo Mode

For users who want to test without credentials:
- Download c2patool binary
- Set `C2PATOOL_PATH` environment variable
- Download trust bundle and set `TRUST_ANCHORS_PATH`
- Enable "Quick demo mode" checkbox

This mode uses server-side c2patool signing instead of the API.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `AUTH_TOKEN` | SSL.com account token | Shared test token |
| `API_BASE` | SSL.com API base URL | `https://api.c2patool.io` |
| `TSA_URL` | Timestamp Authority URL | `https://api.c2patool.io/v1/timestamp` |
| `CERT_PROFILE_ID` | Default certificate profile | ECC profile |
| `CONFORMING_PRODUCT_ID` | Default product UUID | Random UUID |
| `C2PATOOL_PATH` | Path to c2patool binary (demo mode) | Not set |
| `TRUST_ANCHORS_PATH` | Trust bundle path (demo mode) | Not set |

## Deployment

This is a simple Next.js app that can be deployed anywhere:

- **Local:** `npm run dev`
- **Vercel/Netlify:** Connect repo and deploy
- **DigitalOcean App Platform:** Deploy from GitHub
- **Docker:** Standard Next.js Docker setup

No complex infrastructure needed—just a Node.js environment and environment variables for API credentials.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Build for production
npm start            # Run production build
npm run lint         # Lint code
npm run typecheck    # Type check
npm run qa           # Run all checks + build
```

## Data Flow

```
User Browser
    ↓ (WebCrypto generates keypair)
    ↓ (pkijs generates CSR)
    ↓ POST /api/cert-requests
Next.js API Route
    ↓ POST to SSL.com API (with server-side AUTH_TOKEN)
SSL.com API
    ↓ Returns certificate PEM
Next.js API Route
    ↓ Returns cert to browser
User Browser
    ↓ (c2pa-js signs image with cert + manifest)
    ↓ (TSA timestamps the signature)
    ↓ Downloads signed image
```

## Acceptance Criteria

- ✅ Generate EC P-256 keypairs in browser
- ✅ Request C2PA certificates from SSL.com API
- ✅ Edit manifest JSON with presets
- ✅ Sign images with certificates and TSA timestamps
- ✅ Verify signed images and display pretty-printed output
- ✅ Download private keys, certificates, CSRs, and signed assets
- ✅ Display cURL commands for API integration
- ✅ Pre-fill with shared test token for quick testing
- ✅ Support RSA and ECC profiles
- ✅ Support ECC and RSA TSA endpoints
- ✅ No X-Account-ID header in cURL (per API requirements)

## Future Enhancements (Optional)

- Support for additional image formats (WebP, AVIF, etc.)
- Multi-image batch signing
- Advanced manifest editing with schema autocomplete
- Export verification reports as PDF
- Integration with other C2PA tools and validators
