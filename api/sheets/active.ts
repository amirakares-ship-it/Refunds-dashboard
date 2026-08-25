import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getDb, ensureTables, schema } from '../_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    await ensureTables();
    const db = getDb();

    const state = await db.select().from(schema.systemState).where(eq(schema.systemState.key, 'active_dataset_state'));
    let targetSheetId: string | null = state.length > 0 ? state[0].activeSheetId : null;

    if (!targetSheetId) {
      const allSheets = await db.select().from(schema.uploadedSheets);
      if (allSheets.length > 0) {
        targetSheetId = allSheets[0].id;
      }
    }

    if (!targetSheetId) {
      res.status(200).json({ success: true, sheetInfo: null, records: null });
      return;
    }

    const sheetRes = await db.select().from(schema.uploadedSheets).where(eq(schema.uploadedSheets.id, targetSheetId));
    const chunks = await db.select().from(schema.sheetRecordChunks).where(eq(schema.sheetRecordChunks.sheetId, targetSheetId));

    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const allRecords: any[] = [];
    chunks.forEach((c) => {
      try {
        const parsed = JSON.parse(c.records);
        allRecords.push(...parsed);
      } catch (e) {
        console.error('Error parsing records chunk:', e);
      }
    });

    res.status(200).json({
      success: true,
      sheetInfo: sheetRes[0] || null,
      records: allRecords,
    });
  } catch (error: any) {
    console.error('Error fetching active sheet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
