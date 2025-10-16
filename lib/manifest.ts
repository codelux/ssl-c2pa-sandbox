import { z } from 'zod';

// Minimal, not full C2PA schema; just enough to validate fields in UI
export const ManifestSchema = z.object({
  title: z.string().optional(),
  format: z.string().default('image/jpeg'),
  assertions: z.array(z.record(z.any())).default([]),
  ta_url: z.string().url().optional(),
}).strict();

export type Manifest = z.infer<typeof ManifestSchema>;

export const Presets: Record<string, Manifest> = {
  minimal: {
    title: 'Signed image',
    format: 'image/jpeg',
    assertions: [
      { label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.created' }] } },
    ],
    ta_url: 'https://api.c2patool.io/api/v1/timestamps/ecc',
  },
  editorial: {
    title: 'Editorial image',
    format: 'image/jpeg',
    assertions: [
      { label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.edited' }] } },
      { label: 'org.iptc.ext', data: { creditLine: 'SSL.com Preview' } },
    ],
    ta_url: 'https://api.c2patool.io/api/v1/timestamps/ecc',
  },
};
