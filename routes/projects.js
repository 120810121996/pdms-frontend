const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper: check project access
function hasAccess(db, projectId, userId, role) {
  if (role === 'admin') return true;
  const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId);
  if (!project) return false;
  if (project.owner_id === userId) return true;
  return !!db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

// GET /api/projects
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  let projects;
  if (req.user.role === 'admin') {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) as doc_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status='done') as done_count,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
      FROM projects p LEFT JOIN users u ON p.owner_id = u.id
      ORDER BY p.created_at DESC
    `).all();
  } else {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) as doc_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status='done') as done_count,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
      FROM projects p
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN project_members pm ON p.id = pm.project_id
      WHERE p.owner_id = ? OR pm.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all(req.user.id, req.user.id);
  }
  projects = projects.map(p => ({
    ...p,
    progress: p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0
  }));
  res.json(projects);
});

// GET /api/projects/:id
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const project = db.prepare(`
    SELECT p.*, u.name as owner_name FROM projects p
    LEFT JOIN users u ON p.owner_id = u.id WHERE p.id = ?
  `).get(id);
  if (!project) return res.status(404).json({ error: 'Projet non trouvé' });
  if (!hasAccess(db, id, req.user.id, req.user.role))
    return res.status(403).json({ error: 'Accès refusé' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, pm.added_at FROM project_members pm
    JOIN users u ON pm.user_id = u.id WHERE pm.project_id = ?
  `).all(id);

  const taskStats = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) as todo
    FROM tasks WHERE project_id = ?
  `).get(id);

  res.json({
    ...project,
    members,
    task_stats: taskStats,
    progress: taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0
  });
});

// POST /api/projects
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom du projet requis' });

  const result = db.prepare(
    'INSERT INTO projects (name, description, owner_id, color) VALUES (?, ?, ?, ?)'
  ).run(name, description || '', req.user.id, color || '#6366f1');

  db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)')
    .run(result.lastInsertRowid, req.user.id);

  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/projects/:id
router.put('/:id', authenticate, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'Projet non trouvé' });
  if (req.user.role !== 'admin' && project.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Accès refusé' });

  const { name, description, status, color } = req.body;
  db.prepare(`UPDATE projects SET name=?, description=?, status=?, color=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(name || project.name, description ?? project.description, status || project.status, color || project.color, id);

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

// DELETE /api/projects/:id
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'Projet non trouvé' });
  if (req.user.role !== 'admin' && project.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Accès refusé' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.json({ message: 'Projet supprimé avec succès' });
});

// POST /api/projects/:id/members — Admin only
router.post('/:id/members', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id requis' });
  if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Projet non trouvé' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(user_id))
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  try {
    db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(id, user_id);
    res.json({ message: 'Membre ajouté avec succès' });
  } catch {
    res.status(400).json({ error: 'Utilisateur déjà membre du projet' });
  }
});

// DELETE /api/projects/:id/members/:userId — Admin only
router.delete('/:id/members/:userId', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId);
  res.json({ message: 'Membre retiré avec succès' });
});

// GET /api/projects/stats/overview — Admin only
router.get('/stats/overview', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  res.json({
    total_projects: db.prepare('SELECT COUNT(*) as c FROM projects').get().c,
    active_projects: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='active'").get().c,
    total_users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    total_documents: db.prepare('SELECT COUNT(*) as c FROM documents').get().c,
    total_tasks: db.prepare('SELECT COUNT(*) as c FROM tasks').get().c,
    done_tasks: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done'").get().c,
    overdue_tasks: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date < datetime('now') AND status!='done'").get().c
  });
});

module.exports = router;
