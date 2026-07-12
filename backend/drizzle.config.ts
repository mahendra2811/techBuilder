import { defineConfig } from 'drizzle-kit';

// Migrations run DDL (CREATE TABLE etc.) — the restricted runtime role behind DATABASE_URL
// intentionally can't do that (see shared/src/db/rls.sql). Always prefer the privileged
// DATABASE_URL_ADMIN role here; fall back to DATABASE_URL only for a single-role local DB
// where no admin/runtime split exists yet.
export default defineConfig({
  dialect: 'postgresql',
  schema: '../shared/src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL ?? '' },
});
