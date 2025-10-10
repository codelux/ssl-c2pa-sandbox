import { z } from 'zod';

const EnvSchema = z.object({
  ACCOUNT_ID: z.string().min(1).optional(),
  AUTH_TOKEN: z.string().min(1).optional(),
  API_BASE: z.string().url().default('https://api.c2patool.io'),
  TSA_URL: z.string().url().optional(),
  CERT_PROFILE_ID: z.string().optional(),
  CONFORMING_PRODUCT_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const env = EnvSchema.parse({
    ACCOUNT_ID: process.env.ACCOUNT_ID,
    AUTH_TOKEN: process.env.AUTH_TOKEN,
    API_BASE: process.env.API_BASE,
    TSA_URL: process.env.TSA_URL || process.env.NEXT_PUBLIC_TSA_URL,
    CERT_PROFILE_ID: process.env.CERT_PROFILE_ID,
    CONFORMING_PRODUCT_ID: process.env.CONFORMING_PRODUCT_ID,
  });
  return env;
}
