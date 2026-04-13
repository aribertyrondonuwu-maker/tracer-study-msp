// ══════════════════════════════════════════════════════════
//  config.js — Konfigurasi Supabase & Konstanta Global
//  Tracer Study MSP FPIK UNSRAT — LAM PTIP IAPS 1.0
// ══════════════════════════════════════════════════════════

export const SUPABASE_URL  = 'https://oqpdcqpsrnxrvtdodtfj.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcGRjcXBzcm54cnZ0ZG9kdGZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Mjg5MjMsImV4cCI6MjA5MTQwNDkyM30.l_1Ru8Kc2lf0AyeI9PCwyvk_Aq1Mpb33qWx0UmmzwlM';

// ── Tabel Supabase
export const TBL_ALUMNI   = 'ts_alumni';
export const TBL_EMPLOYER = 'ts_employer';
export const TBL_ADMINS   = 'ts_admins';

// ── Role Definitions
export const ROLE = {
  SUPERADMIN : 'superadmin',
  ADMIN      : 'admin',
};

// ── Akses tab per role
//    superadmin → semua tab
//    admin      → hanya analisis
export const TAB_ACCESS = {
  [ROLE.SUPERADMIN] : ['ov','lam','analisis','al','em','usr'],
  [ROLE.ADMIN]      : ['analisis'],
};

// ── 7 Aspek LAM PTIP (Tabel 2.7B) — Kepuasan Pengguna Lulusan
export const ASPEK_LAM = [
  { id:'er1', lbl:'Integritas (Etika dan Moral)' },
  { id:'er2', lbl:'Keahlian Berdasarkan Bidang Ilmu (Profesionalisme)' },
  { id:'er3', lbl:'Kemampuan Berbahasa Asing' },
  { id:'er4', lbl:'Penggunaan Teknologi Informasi' },
  { id:'er5', lbl:'Kemampuan Berkomunikasi' },
  { id:'er6', lbl:'Kemampuan Bekerjasama dalam Tim' },
  { id:'er7', lbl:'Kemampuan Pengembangan Diri' },
];

// ── Penilaian Prodi oleh Alumni
export const ASPEK_PRODI = [
  { id:'ar1', lbl:'Kualitas Kurikulum & Kesesuaian dengan Kebutuhan Lapangan' },
  { id:'ar2', lbl:'Kualitas Pengajaran & Kompetensi Dosen MSP' },
  { id:'ar3', lbl:'Bimbingan Akademik & Pembimbingan Skripsi' },
  { id:'ar4', lbl:'Fasilitas Laboratorium Perairan & Kelautan' },
  { id:'ar5', lbl:'Fasilitas Sarana Prasarana Kampus & Perpustakaan' },
  { id:'ar6', lbl:'Kegiatan PKL / Kerja Lapangan' },
  { id:'ar7', lbl:'Pelayanan Administrasi Akademik' },
];

// ── Warna chart
export const CHART_COLORS = [
  '#003D5B','#006D77','#C5973A','#1B7A4A',
  '#7B5EA7','#C0392B','#17809B','#D97706','#2563EB','#834F00',
];
