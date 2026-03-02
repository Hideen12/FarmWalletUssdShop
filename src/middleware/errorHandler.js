/**
 * Global error handler - avoids leaking internal details in production
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const safeMessage = status >= 500 && isProduction ? 'Internal server error' : (err.message || 'Internal server error');
  res.status(status).json({
    error: safeMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
