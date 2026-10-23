/** One line per request: method, path without the query string, status, duration. Never bodies. */
export function requestLogger(req, res, next) {
  const startedAt = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - startedAt);
    console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms}ms`);
  });
  next();
}
