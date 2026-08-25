import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.warn('[db] No Postgres connection string found (POSTGRES_URL / DATABASE_URL).');
}

const sql = neon(connectionString || '');
export const pgDb = drizzle(sql, { schema });
