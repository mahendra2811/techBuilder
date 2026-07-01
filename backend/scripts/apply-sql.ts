/** Apply raw .sql files (RLS policies, auth function) AFTER drizzle migrations. Usage: tsx apply-sql.ts a.sql b.sql */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error('Pass one or more .sql file paths');
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL(_ADMIN) is required');
  const pool = new Pool({ connectionString: url });
  try {
    for (const f of files) {
      // eslint-disable-next-line no-console
      console.log(`applying ${f} ...`);
      await pool.query(readFileSync(f, 'utf8'));
    }
    // eslint-disable-next-line no-console
    console.log('done.');
  } finally {
    await pool.end();
  }
}

void main();
