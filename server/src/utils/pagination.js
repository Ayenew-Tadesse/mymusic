import { z } from 'zod';

/** Shared query schema for page based listing endpoints. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageResult(items, { page, limit }, total) {
  return { items, page, limit, total, hasMore: page * limit < total };
}
