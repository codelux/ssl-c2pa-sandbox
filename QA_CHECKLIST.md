# QA Checklist — C2PA Sandbox

## Automated

- [ ] Lint passes: `npm run lint`
- [ ] Typecheck passes: `npm run typecheck`
- [ ] Build succeeds: `npm run build`

## Manual — Preview (no issuance)

- [ ] Keys & CSR: Generate keys; download PKCS#8 and CSR; validate with OpenSSL (optional)
- [ ] cURL panel appears and reflects current form values (profile, product ID, CSR, subject)
- [ ] Image & Manifest: Preset loads; TSA switch (ECC/RSA) updates `ta_url`
- [ ] Server demo signer (c2patool) ON:
  - [ ] `C2PATOOL_PATH` set; binary allowed by macOS; `--version` runs
  - [ ] `TRUST_ANCHORS_PATH` set to staging ECC/RSA bundle matching TSA
  - [ ] Select image → Sign Image downloads signed asset
  - [ ] Verify shows a JSON report

## Manual — Issuance (when live)

- [ ] Set `AUTH_TOKEN` (no `X-Account-ID` required)
- [ ] Request Certificate returns PEM
- [ ] Turn OFF server demo signer; client signer works with issued cert
- [ ] Verify report shows pass with TSA details and trust chain

## Visual/UX

- [ ] Header logo and badge render correctly without aspect warnings
- [ ] Dropzone is keyboard accessible; ARIA works
- [ ] Status messages are clear for errors (CSR, sign, TSA, spawn)

