const notFoundHandler = (req, _res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal Server Error' : error.name,
    message: error.message
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
