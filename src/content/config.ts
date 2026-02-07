import { defineCollection, z } from 'astro:content';

// Books Collection
const books = defineCollection({
  type: 'content',
  schema: z.object({
    title_ar: z.string(),
    title_ti: z.string().optional(),
    author: z.string(),
    category: z.enum(['العقيدة', 'الفقه', 'الحديث', 'التفسير', 'السيرة', 'التزكية']),
    description: z.string(),
    pdf_url: z.string(),
    cover_image: z.string().optional(),
    pages: z.number().optional(),
    date: z.date().optional(),
  }),
});

// Videos Collection
const videos = defineCollection({
  type: 'content',
  schema: z.object({
    youtube_url: z.string(),
    title_ar: z.string(),
    title_ti: z.string().optional(),
    series_name: z.string().optional(),
    episode_number: z.number().optional(),
    duration: z.string(),
    scholar: z.string(),
    description: z.string().optional(),
    date: z.date().optional(),
  }),
});

// Audio Collection
const audio = defineCollection({
  type: 'content',
  schema: z.object({
    title_ar: z.string(),
    title_ti: z.string().optional(),
    scholar: z.string(),
    category: z.enum(['محاضرات', 'دروس', 'خطب', 'تلاوات', 'أذكار']),
    duration: z.string(),
    audio_url: z.string().optional(),
    youtube_id: z.string().optional(),
    description: z.string().optional(),
    date: z.date().optional(),
  }),
});

// Scholars Collection (for history/biography)
const scholars = defineCollection({
  type: 'content',
  schema: z.object({
    name_ar: z.string(),
    name_ti: z.string().optional(),
    era: z.string(),
    region: z.string(),
    title: z.string(),
    bio: z.string(),
    achievements: z.array(z.string()).optional(),
    image_url: z.string().optional(),
  }),
});

export const collections = {
  books,
  videos,
  audio,
  scholars,
};
