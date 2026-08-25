const SESSION_KEY = 'admin_password_session';

/**
 * Keeps the verified admin password in sessionStorage only (cleared when the
 * browser tab is closed) — never in localStorage, never committed anywhere.
 * It's attached as a header to the write requests (save/delete/set-active)
 * so the server can check it against ADMIN_PASSWORD.
 */
export function getStoredAdminPassword(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminPassword(password: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, password);
  } catch {
    // ignore (e.g. private browsing storage restrictions)
  }
}

export function clearStoredAdminPassword(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Calls the server to check a password without storing it.
 */
export async function verifyAdminPassword(password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return { success: true };
    }
    return { success: false, error: data?.error || 'Wrong password' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}
