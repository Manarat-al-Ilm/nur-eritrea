export async function checkRateLimit(
  db: D1Database,
  ip: string,
  endpoint: string,
  maxPerHour: number
): Promise<boolean> {
  const now = new Date();
  const window = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}`;

  // Clean up entries older than 2 hours
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const cutoff = `${twoHoursAgo.getUTCFullYear()}-${String(twoHoursAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(twoHoursAgo.getUTCDate()).padStart(2, '0')}T${String(twoHoursAgo.getUTCHours()).padStart(2, '0')}`;
  await db.prepare('DELETE FROM rate_limits WHERE window < ?').bind(cutoff).run();

  // Check current count
  const row = await db.prepare(
    'SELECT count FROM rate_limits WHERE ip = ? AND endpoint = ? AND window = ?'
  ).bind(ip, endpoint, window).first<{ count: number }>();

  if (row && row.count >= maxPerHour) {
    return false; // Rate limited
  }

  // Increment or insert
  await db.prepare(
    `INSERT INTO rate_limits (ip, endpoint, window, count) VALUES (?, ?, ?, 1)
     ON CONFLICT (ip, endpoint, window) DO UPDATE SET count = count + 1`
  ).bind(ip, endpoint, window).run();

  return true; // Allowed
}

export function validateOrigin(request: Request, allowedOrigin: string): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // Non-browser requests (e.g. curl) don't send Origin
  return origin === allowedOrigin;
}

export function sanitizeText(text: unknown, maxLength: number): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return trimmed.slice(0, maxLength);
  return trimmed;
}
