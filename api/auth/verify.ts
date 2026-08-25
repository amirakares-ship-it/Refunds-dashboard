import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) {
    res.status(500).json({
      success: false,
      error: 'ADMIN_PASSWORD is not set in this project\'s Environment Variables yet.',
    });
    return;
  }

  const { password } = req.body || {};
  if (typeof password === 'string' && password === configured) {
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Wrong password' });
  }
}
