const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function canAccess(db, projectId, userId, role) {
  if (role === 'admin') return true;
  const p = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId);
  if (!p) return false;
  if (p.owner_id === userId) return true;
  return !!db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

const taskQuery = `
  SELECT t.*,
    u1.name as assigned_to_name, u1.email as assigned_to_email,
    u2.name as created_by_name
  FROM tasks t
  LEFT JOIN users u1 ON t.assigned_to = u1.id
  LEFT JOIN users u2 ON t.created_by = u2.id
  WHERE t.id = ?
`;

// GET /api/tasks/upcoming
router.get('/upcoming', authenticate, (req, res) => {
  const tasks = getDb().prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE (t.assigned_to = ? OR t.created_by = ?)
      AND t.status != 'done' AND t.due_date IS NOT NULL
    ORDER BY t.due_date ASC LIMIT 10
  `).all(req.user.id, req.user.id);
  res.json(tasks);
});

// GET /api/tasks/project/:projectId
router.get('/project/:projectId', authenticate, (req, res) => {
  const db = getDb();
  const { projectId } = req.params;
  if (!canAccess(db, projectId, req.user.id, req.user.role))
    return res.status(403).json({ error: 'Accès refusé' });

  const tasks = db.prepare(`
    SELECT t.*,
      u1.name as assigned_to_name, u1.email as assigned_to_email,
      u2.name as created_by_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    WHERE t.project_id = ?
    ORDER BY
      CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      t.due_date ASC,
      t.created_at DESC
  `).all(projectId);
  res.json(tasks);
});

// POST /api/tasks/project/:projectId
router.post('/project/:projectId', authenticate, (req, res) => {
  const db = getDb();
  const { projectId } = req.params;
  const { title, description, priority, due_date, assigned_to } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  if (!canAccess(db, projectId, req.user.id, req.user.role))
    return res.status(403).json({ error: 'Accès refusé' });

  const result = db.prepare(`
    INSERT INTO tasks (project_id, title, description, priority, due_date, assigned_to, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, title, description || '', priority || 'medium', due_date || null, assigned_to || null, req.user.id);

  res.status(201).json(db.prepare(taskQuery).get(result.lastInsertRowid));
});

// PUT /api/tasks/:id
router.put('/:id', authenticate, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche non trouvée' });

  const { title, description, status, priority, due_date, assigned_to } = req.body;
  const resetReminder = due_date && due_date !== task.due_date ? 0 : task.reminder_sent;

  db.prepare(`
    UPDATE tasks SET title=?, description=?, status=?, priority=?, due_date=?, assigned_to=?,
      reminder_sent=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(
    title || task.title,
    description ?? task.description,
    status || task.status,
    priority || task.priority,
    due_date !== undefined ? (due_date || null) : task.due_date,
    assigned_to !== undefined ? (assigned_to || null) : task.assigned_to,
    resetReminder,
    req.params.id
  );

  res.json(db.prepare(taskQuery).get(req.params.id));
});

// DELETE /api/tasks/:id
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche non trouvée' });
  if (req.user.role !== 'admin' && task.created_by !== req.user.id)
    return res.status(403).json({ error: 'Accès refusé' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Tâche supprimée avec succès' });
});

module.exports = router;
