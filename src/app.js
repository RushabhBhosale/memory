const express = require('express');
const cors = require('cors');

const memoryRoutes = require('./routes/memoryRoutes');
const { apiKeyMiddleware } = require('./middleware/apiKeyMiddleware');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/memories', apiKeyMiddleware, memoryRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
