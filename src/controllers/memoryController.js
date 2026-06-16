const mongoose = require('mongoose');

const Memory = require('../models/Memory');

const SEARCH_RESULT_LIMIT = 20;

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const createMemory = async (req, res, next) => {
  try {
    const memory = await Memory.create(req.body);
    res.status(201).json({ data: memory });
  } catch (error) {
    next(error);
  }
};

const getMemories = async (_req, res, next) => {
  try {
    const memories = await Memory.find().sort({ createdAt: -1 });
    res.json({ count: memories.length, data: memories });
  } catch (error) {
    next(error);
  }
};

const searchMemories = async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();

    if (!query) {
      throw createError(400, 'Search query parameter q is required');
    }

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexSearch = { $regex: escapedQuery, $options: 'i' };

    const memories = await Memory.find({
      $or: [
        { title: regexSearch },
        { content: regexSearch },
        { category: regexSearch },
        { tags: regexSearch }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(SEARCH_RESULT_LIMIT)
      .lean();

    res.json({
      query,
      count: memories.length,
      limit: SEARCH_RESULT_LIMIT,
      data: memories
    });
  } catch (error) {
    next(error);
  }
};

const getMemoryById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw createError(400, 'Invalid memory id');
    }

    const memory = await Memory.findById(req.params.id);

    if (!memory) {
      throw createError(404, 'Memory not found');
    }

    res.json({ data: memory });
  } catch (error) {
    next(error);
  }
};

const deleteMemory = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw createError(400, 'Invalid memory id');
    }

    const memory = await Memory.findByIdAndDelete(req.params.id);

    if (!memory) {
      throw createError(404, 'Memory not found');
    }

    res.json({ message: 'Memory deleted', data: memory });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createMemory,
  getMemories,
  searchMemories,
  getMemoryById,
  deleteMemory
};
