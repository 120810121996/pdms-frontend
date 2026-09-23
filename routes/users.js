const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users
router.get('/', authenticate, requireAdmin, (req, res) => {
  const users = getDb().prepare(`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
      (SELECT COUNT(*) FROM project_members pm WHERE pm.user_id = u.id) as project_count
    FROM users u ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// POST /api/users
router.post('/', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, email, password, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return res.status(400).json({ error: 'Email déjà utilisé' });

  const result = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, bcrypt.hashSync(password, 10), role === 'admin' ? 'admin' : 'user');

  res.status(201).json(
    db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid)
  );
});

// PUT /api/users/:id
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

  const { name, email, password, role } = req.body;
  db.prepare('UPDATE users SET name=?, email=?, password=?, role=? WHERE id=?').run(
    name || user.name,
    email || user.email,
    password ? bcrypt.hashSync(password, 10) : user.password,
    role || user.role,
    req.params.id
  );
  res.json(db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.params.id));
});

// DELETE /api/users/:id
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Utilisateur supprimé avec succès' });
});

// GET /api/users/all-for-select (list for dropdowns)
router.get('/all-for-select', authenticate, (req, res) => {
  const users = getDb().prepare('SELECT id, name, email, role FROM users ORDER BY name').all();
  res.json(users);
});

// POST /api/users/sync-postgres — Déclenchement manuel de la sauvegarde PostgreSQL (Admin only)
router.post('/sync-postgres', authenticate, requireAdmin, async (req, res) => {
  const { syncSQLiteToPostgres } = require('../services/postgresBackup');
  const result = await syncSQLiteToPostgres();
  if (result.success) {
    res.json({ message: 'Synchronisation PostgreSQL effectuée avec succès', data: result });
  } else {
    res.status(500).json({ error: result.error || 'Erreur lors de la synchronisation PostgreSQL' });
  }
});

module.exports = router;

