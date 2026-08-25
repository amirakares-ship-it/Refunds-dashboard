import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

// Works with Vercel Postgres (POSTGRES_URL) or any manually-set connection string.
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error(
    "No Postgres connection string found. Set POSTGRES_URL (added automatically when you attach a Postgres database to this project in Vercel), or DATABASE_URL, in your .env file before running `npm run db:push`."
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: connectionString,
  },
  verbose: true,
});
