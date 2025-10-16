# SSL.com C2PA API Documentation

Official documentation and examples for integrating SSL.com's C2PA (Coalition for Content Provenance and Authenticity) certificate issuance and timestamping APIs into your applications.

## What is C2PA?

C2PA (Coalition for Content Provenance and Authenticity) is an open technical standard that provides publishers, creators, and consumers the ability to trace the origin of different types of media. SSL.com provides C2PA certificate issuance and timestamping services that allow you to:

- **Issue C2PA certificates** for signing digital content
- **Sign images and media** with cryptographic proof of origin
- **Timestamp signatures** with RFC 3161 compliant timestamps
- **Embed assertions** (metadata about creation, edits, authorship)
- **Verify content provenance** and detect tampering
- **Inspect manifest data** from signed assets

## Key Features

This repository provides:

1. **Complete API Documentation** - Detailed guides for integrating SSL.com's C2PA certificate and timestamping APIs
2. **Web-Based Testing Tool** - Interactive browser application for:
   - Generating EC P-256 keypairs and Certificate Signing Requests (CSRs)
   - Requesting C2PA certificates from SSL.com
   - Signing images with custom manifests and assertions
   - Inspecting C2PA manifests from any signed image
   - Testing both ECC and RSA timestamp authorities
3. **Code Examples** - Working examples in cURL, JavaScript, and Python
4. **Manifest Presets** - Pre-configured manifest templates (minimal, editorial)
5. **Trust Bundle Downloads** - Access to SSL.com's C2PA trust anchors

## API Overview

SSL.com provides two primary API endpoints for C2PA:

| Endpoint | Purpose | Documentation |
|----------|---------|---------------|
| Certificate Issuance | Request C2PA certificates using CSRs | [See below](#certificate-issuance-api) |
| Timestamp Authority (TSA) | RFC 3161 timestamp service | [See below](#timestamp-authority-tsa) |

**Base URL:** `https://api.c2patool.io`

## Getting Started

### 1. Get Your API Token

Contact SSL.com to obtain your account Bearer token for API authentication.

For testing, you can use our shared test token:
```
9b049052a999e98dd5c63b480c523c703a9df4d633910310f0b965bc278993ab
```

### 2. Generate a Key Pair and CSR

Generate an EC P-256 keypair and Certificate Signing Request (CSR) using OpenSSL or your preferred crypto library.

**Using OpenSSL:**

```bash
# Generate EC P-256 private key
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem

# Generate CSR
openssl req -new -key private-key.pem -out request.csr \
  -subj "/C=US/O=Your Organization/CN=Your Name"

# View CSR in PEM format
cat request.csr
```

### 3. Request a C2PA Certificate

Send your CSR to the certificate issuance API to receive a C2PA certificate.

---

## Certificate Issuance API

### Endpoint

```
POST https://api.c2patool.io/api/v1/certificate-requests
```

### Headers

```
Content-Type: application/json
Authorization: Bearer YOUR_API_TOKEN
```

**Note:** The `X-Account-ID` header is not required. Your account is inferred from the Bearer token.

### Request Body

```json
{
  "certificate_profile_id": "764b6cdd-1c1b-4a46-9967-22a112a0b390",
  "certificate_signing_request": "-----BEGIN CERTIFICATE REQUEST-----\nMIHtMIGUAgEA...\n-----END CERTIFICATE REQUEST-----",
  "conforming_product_id": "f5ac57ef-428e-4a82-8852-7bde10b33060",
  "experimental": {
    "CN": "Certificate Common Name",
    "O": "Organization Name",
    "C": "US"
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `certificate_profile_id` | string | Yes | Profile ID for certificate type (ECC or RSA) |
| `certificate_signing_request` | string | Yes | PEM-encoded CSR with `\n` line breaks |
| `conforming_product_id` | string | Yes | UUID identifying your application/product |
| `experimental` | object | Yes | Subject information (CN, O, C fields) |
| `experimental.CN` | string | No | Common Name for the certificate |
| `experimental.O` | string | No | Organization name |
| `experimental.C` | string | No | Two-letter country code (e.g., "US") |

### Certificate Profiles

Two profile IDs are available:

- **ECC Profile** (recommended): `764b6cdd-1c1b-4a46-9967-22a112a0b390`
- **RSA Profile**: `6ba3b70c-38fe-44c3-803f-910c5873d1d6`

### Response

**Success (200 OK):**

```json
{
  "id": "accab0c0-8f73-49db-9873-9e435fcc6055",
  "certificates": [
    {
      "id": "cert-id",
      "serial": "DBE262D5DDE893B33FF3A738BC164410E24C",
      "not_before": "2025-10-15T18:02:23Z",
      "not_after": "2026-01-13T18:02:23Z",
      "subject": "CN=Certificate Common Name,O=Organization,C=US",
      "issuer": "CN=SSL.com C2PA Issuing CA,O=SSL Corp",
      "pem": "-----BEGIN CERTIFICATE-----\nMIIDKjCCArCg...\n-----END CERTIFICATE-----",
      "chain": [
        "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
      ]
    }
  ]
}
```

**Error (400 Bad Request):**

```json
{
  "error": "Invalid CSR format",
  "detail": "Certificate signing request must be PEM-encoded"
}
```

**Error (401 Unauthorized):**

```json
{
  "error": "Invalid or missing authorization token"
}
```

### Example: cURL

```bash
curl --location 'https://api.c2patool.io/api/v1/certificate-requests' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_TOKEN' \
--data '{
    "certificate_profile_id": "764b6cdd-1c1b-4a46-9967-22a112a0b390",
    "certificate_signing_request": "-----BEGIN CERTIFICATE REQUEST-----\nMIHtMIGUAgEAMDQxMjAJBgNVBAYTAlVTMA4GA1UECgwHU1NMLmNvbTAVBgNVBAMM\nDkMyUEEgVGVzdCBVc2VyMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcB/PcyTB\npykpxu2yAxuOPI/V+BeZLqdganyd2iyX83LoNOIlG1IO97GBDJ73rdgggpIFLqPT\nWsLCToUcNc9JyDAKBggqhkjOPQQDAgNIADBFAiEAmpyFgAEv9WwGIg49UCiToVSA\nilyegH2Ss5piOTrwNocCIGy5HpkP6DOX9mh8t5+KShGJ+HDbDLMDqILf1/ubrHoR\n-----END CERTIFICATE REQUEST-----",
    "conforming_product_id": "f5ac57ef-428e-4a82-8852-7bde10b33060",
    "experimental": {
        "CN": "My Application",
        "O": "My Company",
        "C": "US"
    }
}'
```

### Example: JavaScript (Node.js)

```javascript
const https = require('https');

const requestBody = {
  certificate_profile_id: '764b6cdd-1c1b-4a46-9967-22a112a0b390',
  certificate_signing_request: '-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----',
  conforming_product_id: 'f5ac57ef-428e-4a82-8852-7bde10b33060',
  experimental: {
    CN: 'My Application',
    O: 'My Company',
    C: 'US'
  }
};

const options = {
  hostname: 'api.c2patool.io',
  port: 443,
  path: '/api/v1/certificate-requests',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_TOKEN'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const response = JSON.parse(data);
    console.log('Certificate PEM:', response.certificates[0].pem);
  });
});

req.write(JSON.stringify(requestBody));
req.end();
```

### Example: Python

```python
import requests
import json

url = 'https://api.c2patool.io/api/v1/certificate-requests'
headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_TOKEN'
}

payload = {
    'certificate_profile_id': '764b6cdd-1c1b-4a46-9967-22a112a0b390',
    'certificate_signing_request': '-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----',
    'conforming_product_id': 'f5ac57ef-428e-4a82-8852-7bde10b33060',
    'experimental': {
        'CN': 'My Application',
        'O': 'My Company',
        'C': 'US'
    }
}

response = requests.post(url, headers=headers, json=payload)
if response.status_code == 200:
    cert_pem = response.json()['certificates'][0]['pem']
    print(f'Certificate PEM:\n{cert_pem}')
else:
    print(f'Error: {response.status_code} - {response.text}')
```

---

## Timestamp Authority (TSA)

SSL.com provides RFC 3161 compliant timestamp services for C2PA signatures.

### Endpoints

**ECC (Elliptic Curve):**
```
https://api.c2patool.io/api/v1/timestamps/ecc
```

**RSA:**
```
https://api.c2patool.io/api/v1/timestamps/rsa
```

### Protocol

The TSA endpoints accept RFC 3161 Timestamp Requests and return RFC 3161 Timestamp Responses.

**Request:**
- Method: `POST`
- Content-Type: `application/timestamp-query`
- Body: DER-encoded TimeStampReq (RFC 3161)

**Response:**
- Content-Type: `application/timestamp-reply`
- Body: DER-encoded TimeStampResp (RFC 3161)

### Integration with c2patool

If you're using the [c2patool](https://github.com/contentauth/c2patool) command-line tool, specify the TSA URL in your manifest:

```json
{
  "title": "My Signed Image",
  "format": "image/jpeg",
  "ta_url": "https://api.c2patool.io/api/v1/timestamps/ecc",
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          { "action": "c2pa.created" }
        ]
      }
    }
  ]
}
```

Then sign your content:

```bash
c2patool image.jpg -m manifest.json -o signed-image.jpg \
  --private-key private-key.pem \
  --cert certificate.pem
```

### Trust Bundles

Download trust anchors for validating C2PA signatures:

- **ECC Trust Bundle:** https://api.c2patool.io/repository/C2PA-ECC-TRUST-BUNDLE.pem
- **RSA Trust Bundle:** https://api.c2patool.io/repository/C2PA-RSA-TRUST-BUNDLE.pem

### Manifest Inspector

The testing tool includes a built-in **C2PA Manifest Inspector** that allows you to:
- Upload any C2PA-signed image to inspect its manifest
- View manifest details (title, format, instance ID, claim generator)
- Examine signature information (algorithm, issuer, common name, timestamp)
- Browse all assertions embedded in the manifest
- See validation results with color-coded status indicators
- Test how tampering or modifications affect signature validity

**Note:** This inspector uses the official C2PA library to read manifest data, but is not a certified validation product. For production validation, use [Content Credentials Verify](https://contentcredentials.org/verify) or other certified tools.

---

## Complete Workflow Example

Here's a complete end-to-end example of issuing a certificate and signing content:

### Step 1: Generate Key Pair

```bash
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem
```

### Step 2: Create CSR

```bash
openssl req -new -key private-key.pem -out request.csr \
  -subj "/C=US/O=My Company/CN=My Application"
```

### Step 3: Get CSR in PEM Format

```bash
CSR_PEM=$(cat request.csr | sed ':a;N;$!ba;s/\n/\\n/g')
echo $CSR_PEM
```

### Step 4: Request Certificate

```bash
curl --location 'https://api.c2patool.io/api/v1/certificate-requests' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_TOKEN' \
--data "{
    \"certificate_profile_id\": \"764b6cdd-1c1b-4a46-9967-22a112a0b390\",
    \"certificate_signing_request\": \"$CSR_PEM\",
    \"conforming_product_id\": \"$(uuidgen)\",
    \"experimental\": {
        \"CN\": \"My Application\",
        \"O\": \"My Company\",
        \"C\": \"US\"
    }
}" | jq -r '.certificates[0].pem' > certificate.pem
```

### Step 5: Create Manifest

```bash
cat > manifest.json <<EOF
{
  "title": "Signed Image",
  "format": "image/jpeg",
  "ta_url": "https://api.c2patool.io/api/v1/timestamps/ecc",
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [{ "action": "c2pa.created" }]
      }
    }
  ]
}
EOF
```

### Step 6: Sign Content

```bash
c2patool image.jpg \
  -m manifest.json \
  -o signed-image.jpg \
  --private-key private-key.pem \
  --cert certificate.pem
```

### Step 7: Verify Signature

```bash
c2patool signed-image.jpg --info
```

---

## Rate Limits

- **Certificate Issuance:** ~30 requests per minute per IP
- **TSA:** No specific rate limit (standard RFC 3161 usage)

Contact SSL.com support if you need higher rate limits for production use.

## Error Codes

| Status Code | Meaning | Solution |
|-------------|---------|----------|
| 400 | Bad Request | Check request format and required fields |
| 401 | Unauthorized | Verify your Bearer token is correct |
| 422 | Unprocessable Entity | Check CSR format and experimental fields |
| 429 | Too Many Requests | Wait before retrying, respect rate limits |
| 500 | Internal Server Error | Contact SSL.com support |

## Security Best Practices

1. **Never commit API tokens** to version control
2. **Store private keys securely** - never share or expose them
3. **Use environment variables** for sensitive configuration
4. **Rotate API tokens** periodically
5. **Validate certificates** before using them in production
6. **Use HTTPS** for all API communications

## Testing Tool

This repository includes a comprehensive web-based testing tool for experimenting with the APIs:

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to:
- **Generate EC P-256 keypairs and CSRs** in the browser
- **Request C2PA certificates** from SSL.com interactively
- **Sign images** with your certificates and manifests
- **Inspect C2PA manifests** from signed images to view assertions, signatures, and validation results
- **View example cURL commands** with your actual parameters
- **Download** private keys, certificates, CSRs, and signed assets
- **Test TSA endpoints** with both ECC and RSA timestamp servers
- **Validate manifest JSON** with built-in schema validation

## Support

For questions or issues with SSL.com's C2PA APIs:

- **Email:** support@ssl.com
- **Website:** https://www.ssl.com/c2pa/
- **Issues:** https://github.com/JeremiahDoyle/ssl-c2pa-sandbox/issues

## Additional Resources

- **C2PA Specification:** https://c2pa.org/specifications/
- **c2patool:** https://github.com/contentauth/c2patool
- **Content Authenticity Initiative:** https://contentauthenticity.org/

## License

Documentation and examples are provided for integration with SSL.com's C2PA services.
