/**
 * An error whose code and message are safe to show to the client. Any other
 * error that reaches the error handler becomes a generic 500, so internal
 * details never leak.
 */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
