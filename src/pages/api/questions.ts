import type { APIRoute } from 'astro';
import { checkRateLimit, validateOrigin, sanitizeText } from '../../lib/security';
import { getAudioUrl } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;

  const { results } = await db.prepare(
    `SELECT id, question_text, title, answer_text, answer_audio_key, answered_at
     FROM questions WHERE status = 'answered' ORDER BY answered_at DESC`
  ).all();

  const questions = results.map((row: any) => ({
    id: row.id,
    question_text: row.question_text,
    title: row.title,
    answer_text: row.answer_text,
    answer_audio_url: row.answer_audio_key ? getAudioUrl(row.answer_audio_key) : null,
    answered_at: row.answered_at,
  }));

  return new Response(JSON.stringify({ questions }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.runtime.env.DB;
  const { origin: allowedOrigin } = new URL(request.url);

  if (!validateOrigin(request, allowedOrigin)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const allowed = await checkRateLimit(db, ip, 'post-question', 5);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'لقد أرسلت الكثير من الأسئلة. حاول لاحقاً.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const questionText = sanitizeText(body.question_text, 1000);
  if (!questionText) {
    return new Response(
      JSON.stringify({ error: 'يرجى كتابة سؤالك (حد أقصى 1000 حرف)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  await db.prepare(
    'INSERT INTO questions (question_text) VALUES (?)'
  ).bind(questionText).run();

  return new Response(
    JSON.stringify({ success: true, message: 'تم إرسال سؤالك بنجاح' }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
};
