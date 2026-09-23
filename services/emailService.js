const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter && process.env.SMTP_ENABLED === 'true') {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

async function sendTaskReminderEmail({ to, userName, taskTitle, projectName, dueDate }) {
  if (process.env.SMTP_ENABLED !== 'true') {
    console.log(`[EMAIL SKIPPED] Rappel pour ${to} : "${taskTitle}" échéance ${dueDate}`);
    return;
  }
  const t = getTransporter();
  if (!t) return;

  const dueFmt = new Date(dueDate).toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="font-family:Inter,Arial,sans-serif;background:#080810;color:#e2e8f0;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#0e0e1a;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">⏰</div>
      <h1 style="color:white;margin:0;font-size:24px;font-weight:800;">Rappel de tâche</h1>
      <p style="color:rgba(255,255,255,0.8);margin-top:8px;font-size:14px;">PDMS — Système de Gestion de Projets</p>
    </div>
    <div style="padding:40px;">
      <p style="font-size:17px;margin-bottom:16px;">Bonjour <strong>${userName}</strong>,</p>
      <p style="color:#94a3b8;">Vous avez une tâche qui arrive à échéance dans <strong style="color:#f59e0b;">24 heures</strong> :</p>
      <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:24px;margin:24px 0;">
        <h2 style="color:#6366f1;margin:0 0 12px;font-size:18px;">${taskTitle}</h2>
        <p style="margin:6px 0;color:#94a3b8;">📁 Projet : <strong style="color:#e2e8f0;">${projectName}</strong></p>
        <p style="margin:6px 0;color:#94a3b8;">📅 Échéance : <strong style="color:#f59e0b;">${dueFmt}</strong></p>
      </div>
      <p style="color:#64748b;font-size:13px;">Connectez-vous à votre espace PDMS pour mettre à jour cette tâche.</p>
    </div>
    <div style="padding:20px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
      <p style="color:#475569;font-size:12px;margin:0;">PDMS — Système de Gestion de Projets &amp; Documents</p>
    </div>
  </div>
</body></html>`;

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'PDMS <noreply@pdms.com>',
      to,
      subject: `⏰ Rappel : "${taskTitle}" arrive à échéance demain`,
      html
    });
    console.log(`✅ Email envoyé à ${to}`);
  } catch (err) {
    console.error(`❌ Échec envoi email à ${to}:`, err.message);
  }
}

module.exports = { sendTaskReminderEmail };
