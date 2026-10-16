export async function signToken(secret: string, expiresInHours: number): Promise<string> {
  const exp = Date.now() + expiresInHours * 60 * 60 * 1000;
  const payload = JSON.stringify({ exp });
  const payloadB64 = btoa(payload);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payloadB64, sigB64] = parts;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(payloadB64)
  );

  if (!valid) return false;

  const payload = JSON.parse(atob(payloadB64));
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return false;

  return true;
}

export function getAudioUrl(key: string): string {
  return `/api/audio/${key}`;
}

export function getDisplayTitle(title: string | null, questionText: string, maxLen = 80): string {
  if (title) return title;
  return questionText.length > maxLen ? questionText.slice(0, maxLen) + '...' : questionText;
}
