const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Type non autorisé. Utilisez PDF, TXT, DOC ou DOCX.'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

function canAccessProject(db, projectId, userId, role) {
  if (role === 'admin') return true;
  const p = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId);
  if (!p) return false;
  if (p.owner_id === userId) return true;
  return !!db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

// GET /api/documents/project/:projectId
router.get('/project/:projectId', authenticate, (req, res) => {
  const db = getDb();
  const { projectId } = req.params;
  if (!canAccessProject(db, projectId, req.user.id, req.user.role))
    return res.status(403).json({ error: 'Accès refusé' });

  const docs = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name FROM documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.project_id = ? ORDER BY d.created_at DESC
  `).all(projectId);
  res.json(docs);
});

// POST /api/documents/project/:projectId
router.post('/project/:projectId', authenticate, upload.single('file'), (req, res) => {
  const db = getDb();
  const { projectId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
  if (!canAccessProject(db, projectId, req.user.id, req.user.role)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const fileType = (ext === 'docx' || ext === 'doc') ? 'word' : ext;

  const result = db.prepare(`
    INSERT INTO documents (project_id, original_name, file_path, file_type, file_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, req.file.originalname, req.file.filename, fileType, req.file.size, req.user.id);

  res.status(201).json(db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid));
});

// GET /api/documents/:id/view
router.get('/:id/view', authenticate, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' });
  const filePath = path.join(uploadsDir, doc.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
  res.sendFile(filePath);
});

// DELETE /api/documents/:id
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' });
  if (req.user.role !== 'admin' && doc.uploaded_by !== req.user.id)
    return res.status(403).json({ error: 'Accès refusé' });

  const filePath = path.join(uploadsDir, doc.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ message: 'Document supprimé avec succès' });
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.includes('non autorisé')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
