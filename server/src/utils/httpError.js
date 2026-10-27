/** An error that maps directly onto an HTTP response. */
export class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code ?? defaultCode(status);
    this.details = details;
  }
}

function defaultCode(status) {
  return (
    {
      400: 'bad_request',
      401: 'unauthorized',
      402: 'payment_required',
      403: 'forbidden',
      404: 'not_found',
      409: 'conflict',
      410: 'gone',
      422: 'unprocessable',
      429: 'rate_limited',
      451: 'unavailable_for_legal_reasons',
      503: 'unavailable',
    }[status] ?? 'error'
  );
}

export const badRequest = (msg, details) => new HttpError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, msg);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (msg, code) => new HttpError(409, msg, code ?? 'conflict');
