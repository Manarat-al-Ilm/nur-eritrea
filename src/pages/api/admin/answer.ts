import type { APIRoute } from 'astro';
import { verifyToken } from '../../../lib/auth';
import { validateOrigin, sanitizeText } from '../../../lib/security';

export const prerender = false;

const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4'];

export const POST: APIRoute = async ({ request, locals }) => {
  const { origin: allowedOrigin } = new URL(request.url);
  if (!validateOrigin(request, allowedOrigin)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token || !(await verifyToken(token, locals.runtime.env.TOKEN_SECRET))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const db = locals.runtime.env.DB;
  const r2 = locals.runtime.env.R2;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data' }), { status: 400 });
  }

  const questionId = formData.get('question_id');
  if (!questionId || typeof questionId !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing question_id' }), { status: 400 });
  }

  // Verify question exists (any status)
  const question = await db.prepare(
    'SELECT id, status, answer_audio_key FROM questions WHERE id = ?'
  ).bind(Number(questionId)).first<{ id: number; status: string; answer_audio_key: string | null }>();

  if (!question) {
    return new Response(JSON.stringify({ error: 'Question not found' }), { status: 404 });
  }

  const questionText = sanitizeText(formData.get('question_text'), 1000);
  const title = sanitizeText(formData.get('title'), 200);
  const answerText = sanitizeText(formData.get('answer_text'), 5000);
  const audioFile = formData.get('audio') as File | null;
  const removeAudio = formData.get('remove_audio') === 'true';

  if (!answerText && !audioFile && !question.answer_audio_key) {
    return new Response(
      JSON.stringify({ error: 'يرجى تقديم إجابة نصية أو صوتية' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let audioKey: string | null = question.answer_audio_key;
  const hasNewAudio = audioFile && audioFile.size > 0;

  // New audio file takes priority: delete old, upload new.
  // remove_audio without new file: just delete old.
  if (hasNewAudio || removeAudio) {
    if (question.answer_audio_key) {
      await r2.delete(question.answer_audio_key);
    }
    audioKey = null;
  }

  if (hasNewAudio) {
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return new Response(
        JSON.stringify({ error: 'حجم الملف الصوتي كبير جداً (الحد الأقصى 10 ميجابايت)' }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!ALLOWED_AUDIO_TYPES.includes(audioFile.type)) {
      return new Response(
        JSON.stringify({ error: 'نوع الملف غير مدعوم. يرجى استخدام webm أو mp4' }),
        { status: 415, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ext = audioFile.type === 'audio/mp4' ? 'mp4' : 'webm';
    audioKey = `answers/${questionId}.${ext}`;
    const arrayBuffer = await audioFile.arrayBuffer();
    await r2.put(audioKey, arrayBuffer, {
      httpMetadata: { contentType: audioFile.type },
    });
  }

  // For open questions: set answered status. For others: keep current status.
  const isNewAnswer = question.status === 'open';

  if (isNewAnswer) {
    await db.prepare(
      `UPDATE questions SET question_text = COALESCE(?, question_text), title = ?, answer_text = ?, answer_audio_key = ?, status = 'answered', answered_at = datetime('now') WHERE id = ?`
    ).bind(questionText, title, answerText, audioKey, Number(questionId)).run();
  } else {
    await db.prepare(
      `UPDATE questions SET question_text = COALESCE(?, question_text), title = ?, answer_text = ?, answer_audio_key = ? WHERE id = ?`
    ).bind(questionText, title, answerText, audioKey, Number(questionId)).run();
  }

  return new Response(
    JSON.stringify({ success: true, message: 'تم حفظ الإجابة بنجاح' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
