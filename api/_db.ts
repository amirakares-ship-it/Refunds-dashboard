import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/db/schema.js';

// Works with Vercel Postgres (POSTGRES_URL), Neon via Vercel Marketplace (DATABASE_URL),
// or a manually-created Neon instance (any of the URLs below).
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

// @neondatabase/serverless talks to Neon over plain HTTP requests instead of
// keeping a TCP connection/pool open. This is the setup Neon + Vercel
// recommend for serverless functions — it avoids the connection-pool crashes
// that happen with the regular 'pg' driver in short-lived function instances.
function getSql() {
  if (!connectionString) {
    throw new Error(
      'No Postgres connection string found. Add a Postgres database to this project in the Vercel dashboard (Storage tab), which will automatically set POSTGRES_URL.'
    );
  }
  return neon(connectionString);
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

export { schema };

/**
 * Creates the required tables if they don't exist yet.
 * Safe to call on every request — it's a cheap no-op once tables exist.
 */
export async function ensureTables() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS uploaded_sheets (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sheet_record_chunks (
      id SERIAL PRIMARY KEY,
      sheet_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      records TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      active_sheet_id TEXT NOT NULL,
      file_name TEXT,
      row_count INTEGER,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS manual_inputs_state (
      key TEXT PRIMARY KEY,
      manual_total_cancellation_count INTEGER,
      financed_funds TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS customization_state (
      key TEXT PRIMARY KEY,
      customization TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
}
