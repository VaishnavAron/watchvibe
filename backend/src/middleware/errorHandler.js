export function errorHandler(err, req, res, next) {
  console.error('[SERVER ERROR]', err.stack || err.message);

  // Guarantee CORS headers are preserved even on unhandled errors
  const origin = req.headers?.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
    statusCode,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}