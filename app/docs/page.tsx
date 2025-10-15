export default function DocsPage() {
  return (
    <div className="prose prose-sm max-w-none">
      <h1>C2PA Developer Tool API</h1>
      <p>This tool provides a frontend for testing SSL.com&apos;s C2PA certificate issuance, signing, and verification APIs.</p>

      <h2>POST /api/cert-requests</h2>
      <p>Proxies a CSR to the issuance API using server-side secrets. The server transforms the request to match the upstream schema.</p>
      <pre>{`Request (JSON, from client)
{
  "csr": "-----BEGIN CERTIFICATE REQUEST-----...",
  "profileId": "optional",
  "conformingProductId": "optional",
  "subject": { "CN": "Example", "O": "Org", "C": "US" }
}`}</pre>
      <pre>{`Transformed (JSON, to upstream)
{
  "certificate_profile_id": "...",
  "certificate_signing_request": "-----BEGIN CERTIFICATE REQUEST-----...",
  "conforming_product_id": "...",
  "experimental": { "CN": "Example", "O": "Org", "C": "US" }
}`}</pre>
      <p>Headers (account is inferred from Bearer token):</p>
      <pre>{`Authorization: Bearer <YOUR_ACCOUNT_TOKEN>
Content-Type: application/json`}</pre>
      <p><strong>Note:</strong> The <code>X-Account-ID</code> header is <strong>not required</strong>. Your account is automatically inferred from the Bearer token.</p>
      <pre>{`Response (JSON)
{
  "certificatePem": "-----BEGIN CERTIFICATE-----...",
  "requestId": "req_xxx"
}`}</pre>
      <p>Errors are returned as <code>{`{ error: string, reqId: string }`}</code> with appropriate HTTP status.</p>

      <h2>POST /api/tsa/timestamp</h2>
      <p>Binary proxy to the staging TSA (10MB limit). Content-Type must be <code>application/timestamp-query</code> or <code>application/octet-stream</code>.</p>

      <h2>Rate Limits</h2>
      <ul>
        <li>Cert requests: ~30/min per IP</li>
        <li>TSA proxy: ~30/min per IP</li>
      </ul>

      <h2>Environments</h2>
      <ul>
        <li>Local UI: http://localhost:3000</li>
        <li>Issuance API base (preview): env <code>API_BASE</code> (e.g., https://api.c2patool.io)</li>
        <li>TSA URL (staging): env <code>TSA_URL</code> (e.g., https://api.staging.c2pa.ssl.com/v1/timestamp)</li>
      </ul>
    </div>
  );
}
