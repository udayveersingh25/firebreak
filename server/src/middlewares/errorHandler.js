import { HttpError } from '../utils/httpError.js';

// Errors raised by Express itself (body parsing, static files) carry only a status.
const CLIENT_ERRORS = {
  400: ['BAD_REQUEST', 'The request could not be understood.'],
  403: ['FORBIDDEN', 'You do not have access to that.'],
  404: ['NOT_FOUND', 'We could not find what you asked for.'],
  413: ['PAYLOAD_TOO_LARGE', 'That request is too large.'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'That content type is not supported.'],
};

export function apiNotFound(req, res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'That API route does not exist.'));
}

export function notFound(req, res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'Page not found.'));
}

/** Sends every error as { error: { code, message } }. */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, code, message, details } = toPublicError(err);
  if (status >= 500) {
    // Log the stack trace only. Never the error object or the request: body
    // parser errors carry the raw request body, which must never reach logs.
    console.error(`[error] ${req.method} ${req.originalUrl.split('?')[0]}\n${err?.stack ?? err}`);
  }

  res.status(status).json({ error: details ? { code, message, details } : { code, message } });
}

function toPublicError(err) {
  if (err instanceof HttpError) return err;

  if (err?.type === 'entity.parse.failed') {
    return { status: 400, code: 'INVALID_JSON', message: 'The request body is not valid JSON.' };
  }

  const status = err?.status ?? err?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const [code, message] = CLIENT_ERRORS[status] ?? CLIENT_ERRORS[400];
    return { status, code, message };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong on our side. Please try again.',
  };
}
