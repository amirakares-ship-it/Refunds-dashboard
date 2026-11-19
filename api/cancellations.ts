import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getDb, ensureTables, schema } from './_db.js';
import { isAuthorized } from './_auth.js';

const META_KEY = 'cancellations_singleton';

/**
 * Shared data for the "Cancellation Requests 2026" page.
 * Completely separate from the main refunds sheets.
 *
 *  GET  -> { fileName, rowCount, records }       (public, same as other pages)
 *  POST -> { fileName, chunkIndex, totalChunks, records }  (admin password)
 *          chunkIndex 0 wipes the previous data first, so uploads replace
 *          the old sheet. The client sends the sheet in several small chunks
 *          to stay under the serverless request-size limit.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureTables();
  const db = getDb();

  if (req.method === 'GET') {
    try {
      const metaRows = await db.select().from(schema.cancellationMeta).where(eq(schema.cancellationMeta.key, META_KEY));
      if (metaRows.length === 0) {
        res.status(200).json({ success: true, fileName: null, rowCount: 0, records: null });
        return;
      }
      const chunks = await db.select().from(schema.cancellationChunks);
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const records: unknown[] = [];
      chunks.forEach(c => {
        try {
          records.push(...JSON.parse(c.records));
        } catch (e) {
          console.error('Error parsing cancellation chunk:', e);
        }
      });
      res.status(200).json({
        success: true,
        fileName: metaRows[0].fileName,
        rowCount: metaRows[0].rowCount,
        updatedAt: metaRows[0].updatedAt,
        records,
      });
    } catch (error: any) {
      console.error('Error fetching cancellations:', error);
      res.status(500).json({ success: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!isAuthorized(req)) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    try {
      const { fileName, chunkIndex, totalChunks, totalRows, records } = req.body || {};
      if (!Array.isArray(records) || typeof chunkIndex !== 'number' || typeof totalChunks !== 'number') {
        res.status(400).json({ success: false, error: 'Invalid payload' });
        return;
      }
      const updatedAt = new Date().toISOString();

      if (chunkIndex === 0) {
        await db.delete(schema.cancellationChunks);
      }
      await db.insert(schema.cancellationChunks).values({
        chunkIndex,
        totalChunks,
        records: JSON.stringify(records),
        updatedAt,
      });

      if (chunkIndex === totalChunks - 1) {
        await db
          .insert(schema.cancellationMeta)
          .values({ key: META_KEY, fileName: fileName ?? null, rowCount: totalRows ?? null, updatedAt })
          .onConflictDoUpdate({
            target: schema.cancellationMeta.key,
            set: { fileName: fileName ?? null, rowCount: totalRows ?? null, updatedAt },
          });
      }
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error saving cancellations:', error);
      res.status(500).json({ success: false, error: error.message });
    }
    return;
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
