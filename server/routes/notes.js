const express = require('express');
const Note = require('../models/Note');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/notes
 * @desc    Get all notes for the logged-in user
 * @access  Private (Agent1, Agent2, Admin, Super Admin, Restricted Admin)
 */
router.get('/', async (req, res) => {
  try {
    const notes = await Note.find({
      createdBy: req.user._id
    })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: notes,
      count: notes.length
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching notes'
    });
  }
});

/**
 * @route   POST /api/notes
 * @desc    Create a new note
 * @access  Private (Agent1, Agent2, Admin, Super Admin, Restricted Admin)
 */
router.post('/', async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
    }

    if (!req.user.organization) {
      return res.status(400).json({
        success: false,
        message: 'User must belong to an organization'
      });
    }

    const note = await Note.create({
      title: title.trim(),
      content: content.trim(),
      noteDate: req.body.noteDate || null,
      createdBy: req.user._id,
      organization: req.user.organization
    });

    const populatedNote = await Note.findById(note._id)
      .populate('createdBy', 'name email')
      .lean();

    return res.status(201).json({
      success: true,
      data: populatedNote,
      message: 'Note created successfully'
    });
  } catch (error) {
    console.error('Error creating note:', error.message, error.errors || '');
    return res.status(500).json({
      success: false,
      message: error.message || 'Error creating note'
    });
  }
});

/**
 * @route   GET /api/notes/:id
 * @desc    Get a single note by ID
 * @access  Private (Agent1, Agent2, Admin, Super Admin, Restricted Admin)
 */
router.get('/:id', async (req, res) => {
  try {
    const note = await Note.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    })
      .populate('createdBy', 'name email')
      .lean();

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: note
    });
  } catch (error) {
    console.error('Error fetching note:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching note'
    });
  }
});

/**
 * @route   PUT /api/notes/:id
 * @desc    Update a note
 * @access  Private (Agent1, Agent2, Admin, Super Admin, Restricted Admin)
 */
router.put('/:id', async (req, res) => {
  try {
    const { title, content } = req.body;

    const note = await Note.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    if (title) note.title = title.trim();
    if (content) note.content = content.trim();
    note.updatedAt = Date.now();

    await note.save();

    const updatedNote = await Note.findById(note._id)
      .populate('createdBy', 'name email')
      .lean();

    return res.status(200).json({
      success: true,
      data: updatedNote,
      message: 'Note updated successfully'
    });
  } catch (error) {
    console.error('Error updating note:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating note'
    });
  }
});

/**
 * @route   DELETE /api/notes/:id
 * @desc    Delete a note
 * @access  Private (Agent1, Agent2, Admin, Super Admin, Restricted Admin)
 */
router.delete('/:id', async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting note:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting note'
    });
  }
});

module.exports = router;
