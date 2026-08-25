import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getDb, ensureTables, schema } from '../_db.js';
import { isAuthorized } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
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

    const sheets = await db.select().from(schema.uploadedSheets);
    for (const s of sheets) {
      await db
        .update(schema.uploadedSheets)
        .set({ isActive: s.id === sheetId })
        .where(eq(schema.uploadedSheets.id, s.id));
    }

    const sheetInfo = sheets.find((s) => s.id === sheetId);

    await db
      .insert(schema.systemState)
      .values({
        key: 'active_dataset_state',
        activeSheetId: sheetId,
        fileName: sheetInfo?.fileName,
        rowCount: sheetInfo?.rowCount,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: schema.systemState.key,
        set: {
          activeSheetId: sheetId,
          fileName: sheetInfo?.fileName,
          rowCount: sheetInfo?.rowCount,
          updatedAt: new Date().toISOString(),
        },
      });

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
    console.error('Error setting active sheet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
