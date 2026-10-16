import type { APIRoute } from 'astro';
import { verifyToken } from '../../../lib/auth';
import { validateOrigin } from '../../../lib/security';

export const prerender = false;

async function authenticate(request: Request, secret: string): Promise<boolean> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  return !!token && await verifyToken(token, secret);
}

export const GET: APIRoute = async ({ request, locals }) => {
  if (!(await authenticate(request, locals.runtime.env.TOKEN_SECRET))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const db = locals.runtime.env.DB;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'open';

  if (!['open', 'answered', 'hidden'].includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400 });
  }

  const sort = url.searchParams.get('sort') || (status === 'open' ? 'date_asc' : 'date_desc');
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));

  const dateCol = status === 'open' ? 'created_at' : 'answered_at';
  const direction = sort === 'date_asc' ? 'ASC' : 'DESC';
  const orderCol = `${dateCol} ${direction}`;

  const columns = status === 'open'
    ? 'id, question_text, created_at'
    : 'id, question_text, title, answer_text, answer_audio_key, answered_at';

  const { total } = await db.prepare(
    'SELECT COUNT(*) as total FROM questions WHERE status = ?'
  ).bind(status).first<{ total: number }>() ?? { total: 0 };

  const offset = (page - 1) * limit;
  const { results } = await db.prepare(
    `SELECT ${columns} FROM questions WHERE status = ? ORDER BY ${orderCol} LIMIT ? OFFSET ?`
  ).bind(status, limit, offset).all();

  return new Response(JSON.stringify({
    questions: results,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!(await authenticate(request, locals.runtime.env.TOKEN_SECRET))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { id, status } = body;
  if (!id || !['hidden', 'answered'].includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid id or status' }), { status: 400 });
  }

  const db = locals.runtime.env.DB;
  await db.prepare('UPDATE questions SET status = ? WHERE id = ?').bind(status, Number(id)).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const { origin: allowedOrigin } = new URL(request.url);
  if (!validateOrigin(request, allowedOrigin)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  if (!(await authenticate(request, locals.runtime.env.TOKEN_SECRET))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }

  const db = locals.runtime.env.DB;
  const r2 = locals.runtime.env.R2;

  // Check for audio to clean up from R2
  const question = await db.prepare(
    'SELECT answer_audio_key FROM questions WHERE id = ?'
  ).bind(Number(id)).first<{ answer_audio_key: string | null }>();

  if (question?.answer_audio_key) {
    await r2.delete(question.answer_audio_key);
  }

  await db.prepare('DELETE FROM questions WHERE id = ?').bind(Number(id)).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
