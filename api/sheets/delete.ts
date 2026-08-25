import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getDb, ensureTables, schema } from '../_db.js';
import { isAuthorized } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const { sheetId } = req.body || {};
    if (!sheetId) {
      res.status(400).json({ success: false, error: 'Missing sheetId' });
      return;
    }

    await ensureTables();
    const db = getDb();

    await db.delete(schema.uploadedSheets).where(eq(schema.uploadedSheets.id, sheetId));
    await db.delete(schema.sheetRecordChunks).where(eq(schema.sheetRecordChunks.sheetId, sheetId));

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error deleting sheet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
