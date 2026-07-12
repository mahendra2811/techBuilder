import { z } from 'zod';

/** Validated environment — fails loudly at boot if misconfigured. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  /** App DB role MUST be non-superuser + NOBYPASSRLS (see shared/src/db/rls.sql). */
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TTL_SEC: z.coerce.number().default(900), // 15 min
  REFRESH_TTL_SEC: z.coerce.number().default(2_592_000), // 30 days
  /** Comma-separated allowlist, e.g. "https://app.example.com,https://staging.example.com".
   * Unset in production = block all cross-origin (fail closed). Unset outside production =
   * default to localhost:3000 (the web dev server) so local dev needs no extra config. */
  CORS_ORIGINS: z.string().optional(),
  // Cloudflare R2 (presigned uploads)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE: z.string().optional(),
  // SMTP (emailed exports) — all optional; absent → GET /exports/config reports emailEnabled: false.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}
