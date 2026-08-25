import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getDb, ensureTables, schema } from '../_db.js';
import { isAuthorized } from '../_auth.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

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
    const { sheetInfo, records } = req.body || {};
    if (!sheetInfo || !records) {
      res.status(400).json({ success: false, error: 'Missing sheetInfo or records' });
      return;
    }

    await ensureTables();
    const db = getDb();

    // 1. Reset isActive on old sheets if this one is active
    if (sheetInfo.isActive) {
      await db.update(schema.uploadedSheets).set({ isActive: false });
    }

    // 2. Insert or replace sheet metadata
    await db
      .insert(schema.uploadedSheets)
      .values({
        id: sheetInfo.id,
        fileName: sheetInfo.fileName,
        uploadedAt: sheetInfo.uploadedAt,
        rowCount: sheetInfo.rowCount,
        totalAmount: sheetInfo.totalAmount,
        isActive: Boolean(sheetInfo.isActive),
      })
      .onConflictDoUpdate({
        target: schema.uploadedSheets.id,
        set: {
          isActive: Boolean(sheetInfo.isActive),
          rowCount: sheetInfo.rowCount,
          totalAmount: sheetInfo.totalAmount,
        },
      });

    // 3. Replace chunks for this sheet
    await db.delete(schema.sheetRecordChunks).where(eq(schema.sheetRecordChunks.sheetId, sheetInfo.id));

    const CHUNK_SIZE = 400;
    const totalChunks = Math.ceil(records.length / CHUNK_SIZE) || 1;

    for (let i = 0; i < totalChunks; i++) {
      const chunk = records.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await db.insert(schema.sheetRecordChunks).values({
        sheetId: sheetInfo.id,
        chunkIndex: i,
        totalChunks,
        records: JSON.stringify(chunk),
        updatedAt: new Date().toISOString(),
      });
    }

    // 4. Update active-state pointer
    if (sheetInfo.isActive) {
      await db
        .insert(schema.systemState)
        .values({
          key: 'active_dataset_state',
          activeSheetId: sheetInfo.id,
          fileName: sheetInfo.fileName,
          rowCount: records.length,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: schema.systemState.key,
          set: {
            activeSheetId: sheetInfo.id,
            fileName: sheetInfo.fileName,
            rowCount: records.length,
            updatedAt: new Date().toISOString(),
          },
        });
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error saving sheet to PostgreSQL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
