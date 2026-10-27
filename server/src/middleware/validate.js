import { badRequest } from '../utils/httpError.js';

/**
 * Validate request parts with zod schemas. Parsed (and coerced) values are
 * stored on `req.valid.{body,query,params}`; handlers must read from there,
 * never from the raw request, so unvalidated input can't reach the database.
 */
export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    req.valid = req.valid ?? {};
    for (const [part, schema] of Object.entries({ body, query, params })) {
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        return next(badRequest('Invalid request', details));
      }
      req.valid[part] = result.data;
    }
    next();
  };
}
