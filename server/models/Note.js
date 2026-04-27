const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Note title is required'],
    trim: true,
    maxLength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Note content is required'],
    maxLength: [10000, 'Content cannot exceed 10000 characters']
  },
  noteDate: {
    type: String,   // stored as 'YYYY-MM-DD' for easy date grouping
    trim: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
noteSchema.index({ createdBy: 1, createdAt: -1 });
noteSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model('Note', noteSchema);
