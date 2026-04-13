// ══════════════════════════════════════════════════════════
//  auth.js — Autentikasi & Role-Based Access Control
//  Superadmin : semua fitur + kelola admin
//  Admin      : HANYA tab Analisis & Pembahasan
// ══════════════════════════════════════════════════════════

import { db }          from './db.js';
import { TBL_ADMINS, ROLE, TAB_ACCESS } from './config.js';
import { router }      from '../app.js';

// ── State login
let _currentUser = null;
export const getUser    = ()  => _currentUser;
export const isLoggedIn = ()  => _currentUser !== null;
export const isSuperAdmin = ()=> _currentUser?.role === ROLE.SUPERADMIN;
export const isAdmin      = ()=> _currentUser?.role === ROLE.ADMIN;

// ── Login handler
export async function admLogin() {
  const username = document.getElementById('adm-user').value.trim();
  const password = document.getElementById('adm-pass').value;
  const errEl    = document.getElementById('log-err');
  errEl.style.display = 'none';

  if (!username || !password) {
    return showErr(errEl, 'Username dan password wajib diisi.');
  }

  const { data, error } = await db
    .from(TBL_ADMINS)
    .select('*')
    .eq('username', username)
    .eq('is_active', true)
    .single();

  if (error || !data)
    return showErr(errEl, 'Username tidak ditemukan atau akun tidak aktif.');

  if (data.password !== password)
    return showErr(errEl, 'Password salah. Coba lagi.');

  _currentUser = data;
  router.go('admin');
  applyRoleUI();
}

// ── Logout
export function admLogout() {
  _currentUser = null;
  document.getElementById('adm-user').value = '';
  document.getElementById('adm-pass').value = '';
  router.go('landing');
}

// ── Terapkan pembatasan UI berdasarkan role
export function applyRoleUI() {
  if (!_currentUser) return;

  const allowedTabs = TAB_ACCESS[_currentUser.role] || [];
  const allTabs     = ['ov','lam','analisis','al','em','usr'];

  // Sembunyikan / tampilkan tab sesuai role
  allTabs.forEach(tabId => {
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (!btn) return;
    if (allowedTabs.includes(tabId)) {
      btn.style.display = '';
    } else {
      btn.style.display = 'none';
    }
  });

  // Sembunyikan tombol export & kelola data untuk admin biasa
  const exportBtns  = document.querySelectorAll('.export-only-superadmin');
  const deleteBtns  = document.querySelectorAll('.delete-only-superadmin');
  const isSA        = _currentUser.role === ROLE.SUPERADMIN;

  exportBtns.forEach(b => b.style.display = isSA ? '' : 'none');
  deleteBtns.forEach(b => b.style.display = isSA ? '' : 'none');

  // Info user di dashboard
  const infoEl = document.getElementById('usr-info');
  if (infoEl) {
    infoEl.innerHTML = `<strong>Login sebagai: ${_currentUser.full_name || _currentUser.username}</strong>
      &nbsp;<span class="bdg ${isSA ? 'bgb' : 'bgt'}">${_currentUser.role}</span>
      ${isSA ? '— Anda dapat mengelola akun admin dan semua data.' : '— Anda hanya dapat mengakses Analisis & Pembahasan.'}`;
  }

  // Langsung buka tab pertama yang diperbolehkan
  if (allowedTabs.length) {
    import('./admin.js').then(m => m.admTab(allowedTabs[0]));
  }
}

// ── Helper
function showErr(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}
