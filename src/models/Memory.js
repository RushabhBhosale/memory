const mongoose = require('mongoose');

const memorySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
      trim: true
    },
    category: {
      type: String,
      default: 'general',
      trim: true
    },
    tags: {
      type: [String],
      default: []
    },
    source: {
      type: String,
      default: 'manual',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

memorySchema.index({
  title: 'text',
  content: 'text',
  category: 'text',
  tags: 'text'
});

module.exports = mongoose.model('Memory', memorySchema);
