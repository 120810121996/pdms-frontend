const { Pool } = require('pg');
const cron = require('node-cron');
const { getDb } = require('../db/database');

function getPool() {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
  const database = process.env.POSTGRES_DB || 'pdms';
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'postgres';

  return new Pool({
    host,
    port,
    database,
    user,
    password,
    connectionTimeoutMillis: 5000,
  });
}

async function initPostgresSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    DO $$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN (
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name IN ('users', 'projects', 'project_members', 'documents', 'tasks')
              AND column_name != 'id' 
              AND is_nullable = 'NO'
        ) LOOP
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
        END LOOP;
    END $$;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;


    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'active',
      color TEXT DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='nom') THEN
        ALTER TABLE projects ALTER COLUMN nom DROP NOT NULL;
      END IF;
    END $$;

    ALTER TABLE projects ADD COLUMN IF NOT EXISTS name TEXT;

    ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id INTEGER;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE IF NOT EXISTS project_members (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, user_id)
    );

    ALTER TABLE project_members ADD COLUMN IF NOT EXISTS project_id INTEGER;
    ALTER TABLE project_members ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE project_members ADD COLUMN IF NOT EXISTS added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER DEFAULT 0,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id INTEGER;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_name TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_type TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by INTEGER;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      due_date TIMESTAMP,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reminder_sent INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'todo';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to INTEGER;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by INTEGER;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_sent INTEGER DEFAULT 0;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

  `);
}


async function syncSQLiteToPostgres() {
  if (process.env.POSTGRES_BACKUP_ENABLED === 'false') {
    return { success: false, message: 'Sauvegarde PostgreSQL désactivée dans .env' };
  }

  const pool = getPool();
  let client;

  try {
    client = await pool.connect();
    await initPostgresSchema(client);

    const db = getDb();

    // 1. Sync Users
    const users = db.prepare('SELECT * FROM users').all();
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, name, email, password, role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           password = EXCLUDED.password,
           role = EXCLUDED.role`,
        [u.id, u.name, u.email, u.password, u.role, u.created_at]
      );
    }

    // 2. Sync Projects
    const projects = db.prepare('SELECT * FROM projects').all();
    for (const p of projects) {
      await client.query(
        `INSERT INTO projects (id, name, description, owner_id, status, color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           owner_id = EXCLUDED.owner_id,
           status = EXCLUDED.status,
           color = EXCLUDED.color,
           updated_at = EXCLUDED.updated_at`,
        [p.id, p.name, p.description, p.owner_id, p.status, p.color, p.created_at, p.updated_at]
      );
    }

    // 3. Sync Project Members
    const members = db.prepare('SELECT * FROM project_members').all();
    for (const m of members) {
      await client.query(
        `INSERT INTO project_members (id, project_id, user_id, added_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, user_id) DO UPDATE SET
           added_at = EXCLUDED.added_at`,
        [m.id, m.project_id, m.user_id, m.added_at]
      );
    }

    // 4. Sync Documents
    const docs = db.prepare('SELECT * FROM documents').all();
    for (const d of docs) {
      await client.query(
        `INSERT INTO documents (id, project_id, original_name, file_path, file_type, file_size, uploaded_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           project_id = EXCLUDED.project_id,
           original_name = EXCLUDED.original_name,
           file_path = EXCLUDED.file_path,
           file_type = EXCLUDED.file_type,
           file_size = EXCLUDED.file_size,
           uploaded_by = EXCLUDED.uploaded_by`,
        [d.id, d.project_id, d.original_name, d.file_path, d.file_type, d.file_size, d.uploaded_by, d.created_at]
      );
    }

    // 5. Sync Tasks
    const tasks = db.prepare('SELECT * FROM tasks').all();
    for (const t of tasks) {
      await client.query(
        `INSERT INTO tasks (id, project_id, title, description, status, priority, due_date, assigned_to, created_by, reminder_sent, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           project_id = EXCLUDED.project_id,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           priority = EXCLUDED.priority,
           due_date = EXCLUDED.due_date,
           assigned_to = EXCLUDED.assigned_to,
           created_by = EXCLUDED.created_by,
           reminder_sent = EXCLUDED.reminder_sent,
           updated_at = EXCLUDED.updated_at`,
        [t.id, t.project_id, t.title, t.description, t.status, t.priority, t.due_date, t.assigned_to, t.created_by, t.reminder_sent, t.created_at, t.updated_at]
      );
    }

    // Sync PostgreSQL sequences
    const tables = ['users', 'projects', 'project_members', 'documents', 'tasks'];
    for (const tbl of tables) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE(MAX(id), 1)) FROM ${tbl}`);
    }

    const timestamp = new Date().toLocaleString('fr-FR');
    console.log(`✅ [${timestamp}] Sauvegarde PostgreSQL effectuée avec succès (${users.length} util., ${projects.length} proj., ${tasks.length} tâch., ${docs.length} doc.)`);
    return {
      success: true,
      timestamp,
      counts: {
        users: users.length,
        projects: projects.length,
        tasks: tasks.length,
        documents: docs.length
      }
    };
  } catch (err) {
    console.warn(`⚠️ [PostgreSQL Backup] Erreur de synchronisation (PostgreSQL hors-ligne ou mal configuré) : ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

function startPostgresBackupScheduler() {
  if (process.env.POSTGRES_BACKUP_ENABLED === 'false') {
    console.log('ℹ️ Sauvegarde PostgreSQL désactivée dans .env');
    return;
  }

  // Initial sync on startup
  syncSQLiteToPostgres();

  // Periodic schedule (default: every 15 minutes)
  const intervalMinutes = parseInt(process.env.POSTGRES_SYNC_INTERVAL_MINUTES || '15', 10);
  const cronExpr = `*/${intervalMinutes} * * * *`;

  cron.schedule(cronExpr, async () => {
    console.log('🔄 Exécution de la synchronisation programmée SQLite -> PostgreSQL...');
    await syncSQLiteToPostgres();
  });

  console.log(`🐘 Planificateur de sauvegarde PostgreSQL démarré (synchronisation toutes les ${intervalMinutes} minute(s))`);
}

module.exports = {
  syncSQLiteToPostgres,
  startPostgresBackupScheduler
};
