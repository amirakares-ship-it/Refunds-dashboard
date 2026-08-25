import type { VercelRequest } from '@vercel/node';

/**
 * Very lightweight shared-secret check for the write endpoints
 * (save / delete / set-active). The correct password is set once as an
 * environment variable (ADMIN_PASSWORD) in the Vercel project settings —
 * it never lives in the frontend code, so viewing the page source or the
 * bundled JS does not reveal it.
 *
 * This is intentionally simple (a single shared password, not real user
 * accounts) — good enough to stop random visitors from editing the data,
 * but not a substitute for proper authentication if that's ever needed.
 */
export function isAuthorized(req: VercelRequest): boolean {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) {
    // No password configured yet — fail closed (deny) so data can't be
    // edited by anyone until an admin sets ADMIN_PASSWORD in Vercel.
    return false;
  }
  const provided = req.headers['x-admin-password'];
  return typeof provided === 'string' && provided === configured;
}
