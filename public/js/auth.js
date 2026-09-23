// ===== Auth helpers shared across all pages =====
function getToken() { return localStorage.getItem('pdms_token'); }
function setToken(t) { localStorage.setItem('pdms_token', t); }
function getUser() { try { return JSON.parse(localStorage.getItem('pdms_user')); } catch { return null; } }
function setUser(u) { localStorage.setItem('pdms_user', JSON.stringify(u)); }
function clearAuth() { localStorage.removeItem('pdms_token'); localStorage.removeItem('pdms_user'); }

function requireAuth() {
  if (!getToken()) { window.location.href = '/'; return false; }
  return true;
}
function requireAdminRole() {
  if (!requireAuth()) return false;
  if (getUser()?.role !== 'admin') { window.location.href = '/dashboard'; return false; }
  return true;
}
