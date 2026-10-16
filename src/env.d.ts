/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  DB: D1Database;
  R2: R2Bucket;
  ADMIN_PASSWORD: string;
  TOKEN_SECRET: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
