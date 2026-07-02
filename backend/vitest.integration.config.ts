import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/** Integration tests — run against the live DB in backend/.env (RLS-enforced app role). */
function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(__dirname, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m?.[1] && m[2] !== undefined && !line.trim().startsWith('#')) out[m[1]] = m[2];
    }
  } catch {
    // no .env — tests will skip via the DATABASE_URL guard
  }
  return out;
}

export default defineConfig({
  test: {
    include: ['test/**/*.integration.spec.ts'],
    environment: 'node',
    env: loadDotEnv(),
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
