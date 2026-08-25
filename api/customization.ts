import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getDb, ensureTables, schema } from './_db.js';
import { isAuthorized } from './_auth.js';

const SINGLETON_KEY = 'customization_singleton';

/**
 * Shared dashboard appearance/customization state (theme, colors, header
 * text, KPI & chart configs...). GET is public so every visitor who opens
 * the dashboard link sees the exact same look the owner configured — never
 * the app's built-in default colors. POST is protected by the same admin
 * password used everywhere else in the app.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureTables();
  const db = getDb();

  if (req.method === 'GET') {
    try {
      const rows = await db
        .select()
        .from(schema.customizationState)
        .where(eq(schema.customizationState.key, SINGLETON_KEY));

      if (rows.length === 0) {
        res.status(200).json({ success: true, customization: null });
        return;
      }

      const row = rows[0];
      let customization: unknown = null;
      try {
        customization = JSON.parse(row.customization);
      } catch (e) {
        console.error('Error parsing stored customization JSON:', e);
      }

      res.status(200).json({ success: true, customization });
    } catch (error: any) {
      console.error('Error fetching customization:', error);
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
      const customization = req.body;
      if (!customization || typeof customization !== 'object') {
        res.status(400).json({ success: false, error: 'Missing customization payload' });
        return;
      }
      const customizationJson = JSON.stringify(customization);
      const updatedAt = new Date().toISOString();

      await db
        .insert(schema.customizationState)
        .values({ key: SINGLETON_KEY, customization: customizationJson, updatedAt })
        .onConflictDoUpdate({
          target: schema.customizationState.key,
          set: { customization: customizationJson, updatedAt },
        });

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error saving customization:', error);
      res.status(500).json({ success: false, error: error.message });
    }
    return;
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
