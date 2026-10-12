import pg from 'pg';
import { readFile } from 'node:fs/promises';

// Initialize once before parallel test workers to avoid concurrent DDL on a fresh DB.
export default async function setup() {
  if (!process.env.TEST_DATABASE_URL) return;
  const pool = new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  try {
    for (const file of ['schema.sql','support-schema.sql','auth-schema.sql']) {
      await pool.query(await readFile(new URL(`../../database/${file}`,import.meta.url),'utf8'));
    }
  } finally { await pool.end(); }
}
