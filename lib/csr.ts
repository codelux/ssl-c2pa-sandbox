import * as asn1js from 'asn1js';
import {
  CertificationRequest,
  AttributeTypeAndValue,
  RelativeDistinguishedNames,
} from 'pkijs';

function abToB64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function wrapPem(label: string, b64: string) {
  const wrapped = b64.replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
}

export async function generateCsrPem(opts: {
  subject?: { CN?: string; O?: string; C?: string };
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}): Promise<string> {
  const rdn = new RelativeDistinguishedNames({ typesAndValues: [] });
  const { subject } = opts;
  // CountryName must be exactly two letters. If not, skip to avoid malformed CSRs.
  if (subject?.C && /^[A-Za-z]{2}$/.test(subject.C)) {
    rdn.typesAndValues.push(
      new AttributeTypeAndValue({ type: '2.5.4.6', value: new asn1js.PrintableString({ value: subject.C.toUpperCase() }) })
    );
  }
  if (subject?.O) {
    rdn.typesAndValues.push(
      new AttributeTypeAndValue({ type: '2.5.4.10', value: new asn1js.Utf8String({ value: subject.O }) })
    );
  }
  if (subject?.CN) {
    rdn.typesAndValues.push(
      new AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: subject.CN }) })
    );
  }

  const csr = new CertificationRequest({ subject: rdn });
  await csr.subjectPublicKeyInfo.importKey(opts.publicKey);
  await csr.sign(opts.privateKey, 'SHA-256');
  const b64 = abToB64(csr.toSchema(true).toBER(false));
  return wrapPem('CERTIFICATE REQUEST', b64);
}
