const cron = require('node-cron');
const { getDb } = require('../db/database');
const { sendTaskReminderEmail } = require('./emailService');

function startReminderScheduler() {
  // Check every hour for tasks due in the next 24–25 hours
  cron.schedule('0 * * * *', async () => {
    console.log('🔔 Vérification des rappels de tâches...');
    await checkAndSendReminders();
  });
  console.log('⏰ Planificateur de rappels démarré (vérifie toutes les heures)');
}

async function checkAndSendReminders() {
  const db = getDb();

  const tasks = db.prepare(`
    SELECT t.*, u.name as user_name, u.email as user_email, p.name as project_name
    FROM tasks t
    JOIN users u ON t.assigned_to = u.id
    JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'done'
      AND t.reminder_sent = 0
      AND t.due_date IS NOT NULL
      AND t.due_date > datetime('now', '+23 hours')
      AND t.due_date <= datetime('now', '+25 hours')
  `).all();

  console.log(`📋 ${tasks.length} tâche(s) nécessitant un rappel`);

  for (const task of tasks) {
    await sendTaskReminderEmail({
      to: task.user_email,
      userName: task.user_name,
      taskTitle: task.title,
      projectName: task.project_name,
      dueDate: task.due_date
    });
    db.prepare('UPDATE tasks SET reminder_sent = 1 WHERE id = ?').run(task.id);
  }
}

module.exports = { startReminderScheduler };
