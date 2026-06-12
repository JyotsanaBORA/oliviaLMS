'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const DomLead = require('../models/DomLead');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', process.env.UPLOAD_PATH || 'uploads');
const MAX_SIZE   = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const leadDir = path.join(UPLOAD_DIR, req.params.leadId);
    fs.mkdirSync(leadDir, { recursive: true });
    cb(null, leadDir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const safe = `${req.params.leadId}_${req.body.docType || 'doc'}_${Date.now()}${ext}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WEBP, and PDF files are allowed.'));
    }
    cb(null, true);
  },
});

/**
 * POST /domestic-api/uploads/:leadId/document
 * Upload a document and attach it to a DomLead.
 * Form fields: docType (required), file (required)
 */
router.post(
  '/:leadId/document',
  protect,
  authorize('domagent', 'dom_admin', 'dom_superadmin'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }

      const { docType } = req.body;
      const validTypes = [
        'aadhaar_front', 'aadhaar_back', 'pan_card',
        'salary_slip_1', 'salary_slip_2', 'salary_slip_3',
        'bank_statement', 'form_16', 'itr', 'business_proof', 'other',
      ];
      if (!docType || !validTypes.includes(docType)) {
        // Clean up uploaded file
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ success: false, message: 'Invalid or missing docType.' });
      }

      const lead = await DomLead.findById(req.params.leadId);
      if (!lead) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ success: false, message: 'Lead not found.' });
      }

      // Domagent can only upload to their own lead
      if (
        req.user.role === 'domagent' &&
        lead.assignedTo?.toString() !== req.user._id.toString()
      ) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).json({ success: false, message: 'Not authorized.' });
      }

      // Served URL
      const url = `/domestic-api/files/${req.params.leadId}/${req.file.filename}`;

      // Replace existing doc of same type or add new
      const idx = lead.documents.findIndex((d) => d.docType === docType);
      const docEntry = {
        docType,
        originalName: req.file.originalname,
        filename:     req.file.filename,
        mimetype:     req.file.mimetype,
        size:         req.file.size,
        url,
        uploadedAt:   new Date(),
      };

      if (idx >= 0) {
        // Remove old file from disk
        const oldPath = path.join(UPLOAD_DIR, req.params.leadId, lead.documents[idx].filename);
        fs.unlink(oldPath, () => {});
        lead.documents[idx] = docEntry;
      } else {
        lead.documents.push(docEntry);
      }

      await lead.save();

      return res.status(200).json({
        success: true,
        message: 'Document uploaded.',
        document: docEntry,
      });
    } catch (err) {
      console.error('[Uploads] Error:', err.message);
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(500).json({ success: false, message: 'Upload failed.' });
    }
  }
);

/**
 * DELETE /domestic-api/uploads/:leadId/document/:docType
 * Remove a document from a lead.
 */
router.delete(
  '/:leadId/document/:docType',
  protect,
  authorize('domagent', 'dom_admin', 'dom_superadmin'),
  async (req, res) => {
    try {
      const lead = await DomLead.findById(req.params.leadId);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

      if (
        req.user.role === 'domagent' &&
        lead.assignedTo?.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ success: false, message: 'Not authorized.' });
      }

      const idx = lead.documents.findIndex((d) => d.docType === req.params.docType);
      if (idx < 0) return res.status(404).json({ success: false, message: 'Document not found.' });

      const doc = lead.documents[idx];
      const filePath = path.join(UPLOAD_DIR, req.params.leadId, doc.filename);
      fs.unlink(filePath, () => {});
      lead.documents.splice(idx, 1);
      await lead.save();

      return res.status(200).json({ success: true, message: 'Document removed.' });
    } catch (err) {
      console.error('[Uploads] Delete error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to remove document.' });
    }
  }
);

module.exports = router;
