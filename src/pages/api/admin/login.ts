import type { APIRoute } from 'astro';
import { signToken } from '../../../lib/auth';
import { validateOrigin } from '../../../lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { origin: allowedOrigin } = new URL(request.url);
  if (!validateOrigin(request, allowedOrigin)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { password } = body;
  if (!password || password !== locals.runtime.env.ADMIN_PASSWORD) {
    return new Response(
      JSON.stringify({ error: 'كلمة المرور غير صحيحة' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = await signToken(locals.runtime.env.TOKEN_SECRET, 24);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return new Response(
    JSON.stringify({ token, expires_at: expiresAt }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
