const express = require('express');

const {
  createMemory,
  deleteMemory,
  getMemories,
  getMemoryById,
  searchMemories
} = require('../controllers/memoryController');

const router = express.Router();

router.post('/', createMemory);
router.get('/', getMemories);
router.get('/search', searchMemories);
router.get('/:id', getMemoryById);
router.delete('/:id', deleteMemory);

module.exports = router;
