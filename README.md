# C2PA Developer Tool

A lightweight web interface for testing SSL.com's C2PA certificate issuance, signing, and verification API endpoints. Generate keys, request certificates, sign images with C2PA manifests, and verify provenance—all with pretty-printed output for easy debugging.

## What This Tool Does

This tool provides a simple UI for developers to:

1. **Generate EC keypairs** (P-256) and CSRs in the browser
2. **Request C2PA certificates** from SSL.com's developer API
3. **Edit C2PA manifest assertions** with JSON presets and live editing
4. **Sign images** with certificates and embed timestamped manifests
5. **Verify signed assets** and view pretty-printed assertion data
6. **Download** private keys, certificates, CSRs, and signed assets
7. **Copy cURL commands** for easy API integration into your own apps

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional)

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

The tool comes pre-configured with a shared test token for quick testing. To use your own credentials, update `AUTH_TOKEN` in `.env.local` with your account token from SSL.com.

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Use

### Basic Flow

1. **Generate Keys & CSR** - Click to create an EC P-256 keypair in your browser
2. **Request Certificate** - Send the CSR to SSL.com's API and receive a C2PA certificate
3. **Upload an Image** - Drag and drop a PNG or JPEG file
4. **Edit Manifest** - Use presets or write custom JSON assertions
5. **Sign Image** - Embed the manifest with your certificate and timestamp
6. **Verify** - Check the signature and view pretty-printed claims
7. **Download** - Save your private key, certificate, and signed image

### API Integration

The tool displays a ready-to-use cURL command that shows exactly how to call the certificate issuance API. Click "Show API cURL" to see the command with your current settings, then copy it for use in your own applications.

**Example cURL:**

```bash
curl --location 'https://api.c2patool.io/api/v1/certificate-requests' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer 9b049052a999e98dd5c63b480c523c703a9df4d633910310f0b965bc278993ab' \
--data '{
    "certificate_profile_id": "764b6cdd-1c1b-4a46-9967-22a112a0b390",
    "certificate_signing_request": "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----",
    "conforming_product_id": "f5ac57ef-428e-4a82-8852-7bde10b33060",
    "experimental": {
        "CN": "Demo Certificate CN",
        "O": "SSL.com Corporation",
        "C": "US"
    }
}'
```

**Note:** The `X-Account-ID` header is not required—your account is inferred from the Bearer token.

## Certificate Profiles

Two profile IDs are available:

- **ECC Profile** (default): `764b6cdd-1c1b-4a46-9967-22a112a0b390`
- **RSA Profile**: `6ba3b70c-38fe-44c3-803f-910c5873d1d6`

Select your preferred profile from the dropdown in the UI.

## TSA Endpoints

Timestamping is provided by SSL.com's staging TSA:

- **ECC (default)**: `https://api.staging.c2pa.ssl.com/v1/timestamp`
- **RSA**: `https://api.staging.c2pa.ssl.com/v1/timestamp/rsa`

Use the TSA dropdown in the manifest editor to switch between ECC and RSA.

## Optional: Quick Demo Mode

If you want to test signing without credentials, you can enable "Quick demo mode" which uses the c2patool CLI binary for signing.

### Setup for Demo Mode:

1. Download the c2patool binary for your platform
2. Set `C2PATOOL_PATH` in `.env.local` (e.g., `C2PATOOL_PATH=./bin/c2patool`)
3. Download the trust bundle:
   - ECC: https://api.staging.c2pa.ssl.com/repository/C2PA-ECC-TRUST-BUNDLE.pem
   - RSA: https://api.staging.c2pa.ssl.com/repository/C2PA-RSA-TRUST-BUNDLE.pem
4. Set `TRUST_ANCHORS_PATH` to the downloaded bundle path

Check the "Quick demo mode" checkbox to use this feature.

## Development

### Lint & Type Check

```bash
npm run lint
npm run typecheck
```

### Build for Production

```bash
npm run build
npm start
```

### Quality Assurance

```bash
npm run qa  # Runs lint + typecheck + build
```

## API Documentation

Visit [http://localhost:3000/docs](http://localhost:3000/docs) for detailed API endpoint documentation.

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── cert-requests/  # Proxies to SSL.com certificate issuance API
│   │   ├── sign/           # Optional demo signing with c2patool
│   │   └── tsa/            # TSA timestamp proxy
│   ├── docs/               # API documentation page
│   └── page.tsx            # Main UI
├── components/             # Reusable React components
├── lib/                    # Utilities (CSR generation, manifest schemas, etc.)
└── public/                 # Static assets
```

## Security Notes

- Private keys are generated client-side and never leave your browser
- Keys are stored in memory only (not persisted)
- The shared test token is for demonstration purposes only
- For production use, obtain your own account token from SSL.com

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_TOKEN` | Your SSL.com account Bearer token | Shared test token |
| `API_BASE` | SSL.com C2PA API base URL | `https://api.c2patool.io` |
| `TSA_URL` | Timestamp Authority URL | `https://api.staging.c2pa.ssl.com/v1/timestamp` |
| `CERT_PROFILE_ID` | Default certificate profile (ECC or RSA) | ECC profile ID |
| `CONFORMING_PRODUCT_ID` | Default conforming product UUID | Random UUID |
| `C2PATOOL_PATH` | Path to c2patool binary (for demo mode) | Not set |
| `TRUST_ANCHORS_PATH` | Path to trust bundle PEM (for demo mode) | Not set |

## Support

For questions or issues with SSL.com's C2PA APIs, contact SSL.com support or visit the documentation at https://www.ssl.com/c2pa/

## License

Private project for SSL.com
