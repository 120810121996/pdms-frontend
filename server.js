require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./db/database');
const { startReminderScheduler } = require('./services/reminderScheduler');
const { startPostgresBackupScheduler } = require('./services/postgresBackup');

const app = express();
const PORT = process.env.PORT || 3000;


// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Init DB + seed admin
initDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/users', require('./routes/users'));

// SPA Page routes
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/projects', (req, res) => res.sendFile(path.join(__dirname, 'public', 'projects.html')));
app.get('/project/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'project-detail.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Start schedulers
startReminderScheduler();
startPostgresBackupScheduler();

app.listen(PORT, () => {

  console.log('');
  console.log('  🚀 PDMS démarré avec succès !');
  console.log(`  🌐 URL : http://localhost:${PORT}`);
  console.log(`  👤 Admin : ${process.env.ADMIN_EMAIL || 'admin@pdms.com'}`);
  console.log(`  📧 Email : ${process.env.SMTP_ENABLED === 'true' ? 'activé' : 'désactivé (configurer SMTP dans .env)'}`);
  console.log('');
});
