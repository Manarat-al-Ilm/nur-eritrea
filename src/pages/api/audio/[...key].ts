import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const key = params.key;
  if (!key) {
    return new Response('Not found', { status: 404 });
  }

  // Check Cloudflare edge cache first (avoids R2 read on repeat requests)
  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const r2 = locals.runtime.env.R2;
  const object = await r2.get(key);

  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  const response = new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'audio/webm',
      'Content-Length': String(object.size),
      'ETag': object.httpEtag,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });

  // Store in edge cache for future requests
  request.method === 'GET' && cache.put(cacheKey, response.clone());

  return response;
};
