import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getDb, ensureTables, schema } from '../_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const sheetId = (req.query.sheetId as string) || '';
    if (!sheetId) {
      res.status(400).json({ success: false, error: 'Missing sheetId query param' });
      return;
    }

    await ensureTables();
    const db = getDb();

    const chunks = await db.select().from(schema.sheetRecordChunks).where(eq(schema.sheetRecordChunks.sheetId, sheetId));
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const records: any[] = [];
    chunks.forEach((c) => {
      try {
        records.push(...JSON.parse(c.records));
      } catch (e) {
        console.error('Error parsing chunk:', e);
      }
    });

    res.status(200).json({ success: true, records });
  } catch (error: any) {
    console.error('Error fetching records for sheet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
