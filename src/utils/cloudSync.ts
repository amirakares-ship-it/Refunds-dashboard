import { RefundRecord, ManualInputs, DashboardCustomization } from '../types';
import { StoredSheetInfo } from './sqliteStore';
import { getStoredAdminPassword } from './adminAuth';

/**
 * Cloud sync talks to this project's OWN Postgres database via the
 * serverless functions under /api/sheets/*  (see /api/_db.ts).
 * No external Firebase console, no separate account — the data lives in a
 * Postgres database attached to this same Vercel project. Anyone who opens
 * the deployed link fetches from the same database, so uploads are visible
 * to everyone automatically.
 *
 * Write requests (save/delete/set-active) include the admin password as a
 * header so the server can reject edits from anyone who hasn't unlocked
 * edit mode with the correct password.
 */
function authHeaders(): Record<string, string> {
  const pwd = getStoredAdminPassword();
  return pwd ? { 'x-admin-password': pwd } : {};
}

/**
 * Save an uploaded sheet and its records to the project's own database.
 */
export async function saveSheetToCloud(sheetInfo: StoredSheetInfo, records: RefundRecord[]): Promise<void> {
  const res = await fetch('/api/sheets/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ sheetInfo, records }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Save request failed with status ${res.status}`);
  }
  console.log(`[Cloud Sync] Saved ${records.length} records to the project database for sheet ${sheetInfo.fileName}`);
}

/**
 * Get all available sheets from the project's own database.
 */
export async function getCloudSheets(): Promise<StoredSheetInfo[]> {
  try {
    const res = await fetch('/api/sheets');
    const data = await res.json();
    if (data.success && data.sheets) {
      return data.sheets.map((s: any) => ({
        id: s.id,
        fileName: s.fileName,
        uploadedAt: s.uploadedAt,
        rowCount: s.rowCount,
        totalAmount: s.totalAmount,
        isActive: s.isActive,
      }));
    }
    return [];
  } catch (error) {
    console.warn('[Cloud Sync] Failed to fetch sheets from project database:', error);
    return [];
  }
}

/**
 * Fetch records for a specific sheet from the project's own database.
 */
export async function getCloudRecordsForSheet(sheetId: string): Promise<RefundRecord[] | null> {
  try {
    const res = await fetch(`/api/sheets/records?sheetId=${encodeURIComponent(sheetId)}`);
    const data = await res.json();
    if (data.success && data.records) {
      return data.records;
    }
    return null;
  } catch (error) {
    console.warn(`[Cloud Sync] Failed to load records for sheet ${sheetId}:`, error);
    return null;
  }
}

/**
 * Fetch active dataset and metadata from the project's own database.
 */
export async function getActiveCloudDataset(): Promise<{
  sheetInfo: StoredSheetInfo | null;
  records: RefundRecord[] | null;
}> {
  try {
    const res = await fetch('/api/sheets/active');
    const data = await res.json();
    if (data.success && data.records && data.records.length > 0) {
      return {
        sheetInfo: data.sheetInfo,
        records: data.records,
      };
    }
    return { sheetInfo: null, records: null };
  } catch (error) {
    console.warn('[Cloud Sync] Error getting active dataset from project database:', error);
    return { sheetInfo: null, records: null };
  }
}

/**
 * Set active sheet in the project's own database.
 */
export async function setActiveSheetOnCloud(sheetId: string): Promise<void> {
  try {
    await fetch('/api/sheets/set-active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ sheetId }),
    });
  } catch (error) {
    console.error('[Cloud Sync] Error setting active sheet on project database:', error);
  }
}

/**
 * Delete a sheet from the project's own database.
 */
export async function deleteSheetFromCloud(sheetId: string): Promise<void> {
  try {
    await fetch('/api/sheets/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ sheetId }),
    });
  } catch (error) {
    console.error('[Cloud Sync] Error deleting sheet from project database:', error);
  }
}

/**
 * Live-update subscriptions aren't needed with the simple Postgres setup —
 * the dashboard re-fetches the active dataset on load. Kept as a no-op so
 * existing call sites don't break.
 */
export function subscribeToActiveCloudState(_onUpdate: (sheetId: string) => void): () => void {
  return () => {};
}

/**
 * Fetch the shared Manual Inputs (Total Cancellation Count override +
 * Financed Funds matrix) from the project's own database. Returns null if
 * nothing has been saved there yet, so the caller can fall back to whatever
 * default/local value it already has.
 */
export async function getCloudManualInputs(): Promise<ManualInputs | null> {
  try {
    const res = await fetch('/api/manual-inputs');
    const data = await res.json();
    if (data.success && data.manualInputs) {
      return data.manualInputs as ManualInputs;
    }
    return null;
  } catch (error) {
    console.warn('[Cloud Sync] Failed to fetch manual inputs from project database:', error);
    return null;
  }
}

/**
 * Save the shared Manual Inputs to the project's own database so anyone who
 * opens the dashboard link sees the same manually-entered numbers.
 */
export async function saveManualInputsToCloud(manualInputs: ManualInputs): Promise<void> {
  const res = await fetch('/api/manual-inputs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(manualInputs),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Save request failed with status ${res.status}`);
  }
}

/**
 * Fetch the shared dashboard customization (theme, colors, chart configs...)
 * from the project's own database. Returns null if nothing has been saved
 * there yet, so the caller can fall back to the app's built-in defaults.
 */
export async function getCloudCustomization(): Promise<DashboardCustomization | null> {
  try {
    const res = await fetch('/api/customization');
    const data = await res.json();
    if (data.success && data.customization) {
      return data.customization as DashboardCustomization;
    }
    return null;
  } catch (error) {
    console.warn('[Cloud Sync] Failed to fetch customization from project database:', error);
    return null;
  }
}

/**
 * Save the shared dashboard customization to the project's own database so
 * anyone who opens the dashboard link sees the exact same colors/appearance
 * currently configured — not the app's default theme.
 */
export async function saveCustomizationToCloud(customization: DashboardCustomization): Promise<void> {
  const res = await fetch('/api/customization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(customization),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Save request failed with status ${res.status}`);
  }
}
