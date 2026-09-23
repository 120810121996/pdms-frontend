// ===== Shared App Utilities =====

async function api(path, opts = {}) {
  const token = getToken();
  const isFormData = opts.body instanceof FormData;
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (opts.headers) Object.assign(headers, opts.headers);

  const res = await fetch('/api' + path, { ...opts, headers });

  if (res.status === 401) { clearAuth(); window.location.href = '/'; return; }

  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// ===== Toast Notifications =====
function toast(msg, type = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) { root = document.createElement('div'); root.id = 'toast-root'; document.body.appendChild(root); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span style="flex:1">${msg}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'tout .3s ease forwards';
    setTimeout(() => el.remove(), 320);
  }, 4000);
}

// ===== Formatting =====
function fmtSize(b) {
  if (!b) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDatetime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function relDate(d) {
  if (!d) return '';
  const diff = Math.round((new Date(d) - new Date()) / 86400000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'demain';
  if (diff === -1) return 'hier';
  if (diff > 0) return `dans ${diff} j`;
  return `il y a ${Math.abs(diff)} j`;
}
function dueCls(d, status) {
  if (!d || status === 'done') return 'due-ok';
  const diff = Math.round((new Date(d) - new Date()) / 86400000);
  if (diff < 0) return 'due-warn';
  if (diff <= 1) return 'due-soon';
  return 'due-ok';
}
function statusLabel(s) {
  return { todo: 'À faire', in_progress: 'En cours', done: 'Terminé' }[s] || s;
}
function priorityLabel(p) {
  return { low: '🟢 Faible', medium: '🟡 Moyen', high: '🔴 Urgent' }[p] || p;
}
function docIcon(t) {
  return { pdf: '📄', txt: '📝', word: '📘' }[t] || '📎';
}

// ===== Sidebar Setup =====
function setupSidebar(activePage) {
  const user = getUser();
  if (!user) return;
  const nameEl = document.getElementById('sidebarName');
  const roleEl = document.getElementById('sidebarRole');
  const avatarEl = document.getElementById('sidebarAvatar');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Administrateur' : 'Utilisateur';
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = user.role === 'admin' ? '' : 'none';
  });
  if (activePage) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === activePage);
    });
  }
}

// ===== Logout =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    confirm('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter de votre session ?', () => {
      clearAuth();
      window.location.href = '/';
    });
  });
});


// ===== Confirm Modal =====
function confirm(title, message, onOk) {
  const ov = document.getElementById('confirmOverlay');
  if (!ov) {
    if (window.confirm(`${title}\n\n${message}`)) onOk();
    return;
  }
  document.getElementById('confirmTitle').textContent = title;

  document.getElementById('confirmMsg').textContent = message;
  ov.classList.add('open');

  const ok = document.getElementById('confirmOk');
  const cancel = document.getElementById('confirmCancel');

  function close() {
    ov.classList.remove('open');
    ok.removeEventListener('click', doOk);
    cancel.removeEventListener('click', close);
    ov.removeEventListener('click', bgClose);
  }
  function doOk() { close(); onOk(); }
  function bgClose(e) { if (e.target === ov) close(); }

  ok.addEventListener('click', doOk);
  cancel.addEventListener('click', close);
  ov.addEventListener('click', bgClose);
}

// ===== Open/Close modal helpers =====
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
