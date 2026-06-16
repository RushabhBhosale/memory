const apiKeyMiddleware = (req, res, next) => {
  const expectedApiKey = process.env.MEMORY_API_KEY;
  const providedApiKey = req.get('x-api-key');

  if (!expectedApiKey) {
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'MEMORY_API_KEY is required'
    });
  }

  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'A valid x-api-key header is required'
    });
  }

  return next();
};

module.exports = { apiKeyMiddleware };
