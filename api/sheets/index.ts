import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, ensureTables, schema } from '../_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    await ensureTables();
    const db = getDb();
    const sheets = await db.select().from(schema.uploadedSheets);
    res.status(200).json({ success: true, sheets });
  } catch (error: any) {
    console.error('Error fetching sheets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
