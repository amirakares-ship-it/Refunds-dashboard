import { CancellationRecord } from './cancellationsProcessor';
import { getStoredAdminPassword } from './adminAuth';

/**
 * Storage for the "Cancellation Requests 2026" sheet.
 * Shared database first (/api/cancellations), browser localStorage as a
 * fallback/cache so the page still works if the API is unreachable.
 * Does not touch any of the existing sheets/tables.
 */

const LS_KEY = 'cancellation_requests_2026_v1';
const CHUNK_SIZE = 500;

export interface StoredCancellations {
  fileName: string | null;
  records: CancellationRecord[];
  source: 'cloud' | 'local' | 'none';
}

function readLocal(): { fileName: string | null; records: CancellationRecord[] } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.records)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocal(fileName: string | null, records: CancellationRecord[]): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ fileName, records }));
    return true;
  } catch {
    return false; // quota exceeded etc.
  }
}

export function loadLocalCancellations(): StoredCancellations {
  const local = readLocal();
  return local ? { ...local, source: 'local' } : { fileName: null, records: [], source: 'none' };
}

export async function loadCancellations(): Promise<StoredCancellations> {
  try {
    const res = await fetch('/api/cancellations');
    const data = await res.json();
    if (res.ok && data?.success && Array.isArray(data.records) && data.records.length > 0) {
      writeLocal(data.fileName ?? null, data.records);
      return { fileName: data.fileName ?? null, records: data.records, source: 'cloud' };
    }
  } catch (e) {
    console.warn('[Cancellations] Cloud load failed, using local copy:', e);
  }
  return loadLocalCancellations();
}

/**
 * Saves the sheet. Always keeps a local copy; also tries the shared database.
 * Returns where it ended up so the UI can tell the user honestly.
 */
export async function saveCancellations(
  fileName: string,
  records: CancellationRecord[]
): Promise<{ cloud: boolean; local: boolean; error?: string }> {
  const local = writeLocal(fileName, records);

  const pwd = getStoredAdminPassword();
  const totalChunks = Math.max(1, Math.ceil(records.length / CHUNK_SIZE));
  try {
    for (let i = 0; i < totalChunks; i++) {
      const res = await fetch('/api/cancellations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(pwd ? { 'x-admin-password': pwd } : {}) },
        body: JSON.stringify({
          fileName,
          chunkIndex: i,
          totalChunks,
          totalRows: records.length,
          records: records.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
    }
    return { cloud: true, local };
  } catch (e: any) {
    return { cloud: false, local, error: e?.message || 'Unknown error' };
  }
}
