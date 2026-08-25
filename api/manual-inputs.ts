import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getDb, ensureTables, schema } from './_db.js';
import { isAuthorized } from './_auth.js';

const SINGLETON_KEY = 'manual_inputs_singleton';

/**
 * Shared Manual Inputs state (Total Cancellation Count override + the
 * Financed Funds matrix). GET is public so anyone opening the dashboard
 * link sees the same manually-entered numbers; POST is protected by the
 * same admin password used everywhere else in the app.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureTables();
  const db = getDb();

  if (req.method === 'GET') {
    try {
      const rows = await db
        .select()
        .from(schema.manualInputsState)
        .where(eq(schema.manualInputsState.key, SINGLETON_KEY));

      if (rows.length === 0) {
        res.status(200).json({ success: true, manualInputs: null });
        return;
      }

      const row = rows[0];
      let financedFunds: Record<string, Record<string, number>> = {};
      try {
        financedFunds = JSON.parse(row.financedFunds);
      } catch (e) {
        console.error('Error parsing stored financedFunds JSON:', e);
      }

      res.status(200).json({
        success: true,
        manualInputs: {
          manualTotalCancellationCount: row.manualTotalCancellationCount,
          financedFunds,
        },
      });
    } catch (error: any) {
      console.error('Error fetching manual inputs:', error);
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
      const { manualTotalCancellationCount, financedFunds } = req.body || {};
      const financedFundsJson = JSON.stringify(financedFunds || {});
      const updatedAt = new Date().toISOString();

      await db
        .insert(schema.manualInputsState)
        .values({
          key: SINGLETON_KEY,
          manualTotalCancellationCount: manualTotalCancellationCount ?? null,
          financedFunds: financedFundsJson,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: schema.manualInputsState.key,
          set: {
            manualTotalCancellationCount: manualTotalCancellationCount ?? null,
            financedFunds: financedFundsJson,
            updatedAt,
          },
        });

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error saving manual inputs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
    return;
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
