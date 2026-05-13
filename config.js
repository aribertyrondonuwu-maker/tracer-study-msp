// ══════════════════════════════════════════════════════════
//  config.js — Konfigurasi Supabase & Konstanta Global
//  Tracer Study MSP FPIK UNSRAT — LAM PTIP IAPS 1.0
// ══════════════════════════════════════════════════════════

export const SUPABASE_URL  = 'https://oqpdcqpsrnxrvtdodtfj.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcGRjcXBzcm54cnZ0ZG9kdGZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Mjg5MjMsImV4cCI6MjA5MTQwNDkyM30.l_1Ru8Kc2lf0AyeI9PCwyvk_Aq1Mpb33qWx0UmmzwlM';

// ── Tabel Supabase
export const TBL_ALUMNI       = 'ts_alumni';
export const TBL_EMPLOYER     = 'ts_employer';
export const TBL_ADMINS       = 'ts_admins';
export const TBL_STAKEHOLDER  = 'ts_stakeholder';

// ── Role Definitions
export const ROLE = {
  SUPERADMIN : 'superadmin',
  ADMIN      : 'admin',
};

// ── Akses tab per role
//    superadmin → semua tab
//    admin      → hanya analisis
export const TAB_ACCESS = {
  [ROLE.SUPERADMIN] : ['ov','lam','analisis','al','em','sk','excel','usr'],
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

// ── Tahun Survei (LAM PTIP)
export const TAHUN_SURVEI = {
  TS   : 2025,
  TS_1 : 2024,
  TS_2 : 2023,
};
export const TAHUN_OPTIONS = [
  { value: 2025, label: 'TS (2025)' },
  { value: 2024, label: 'TS-1 (2024)' },
  { value: 2023, label: 'TS-2 (2023)' },
];

// ── Tahun Tracer Study & Kepuasan Pengguna Lulusan (Program Sarjana)
//    Sesuai LKPS IAPS 1.0 LAM PTIP: data diambil dari TS-4 s.d. TS-2
//    Tabel 2.8b1 (Waktu Tunggu) & Tabel 2.7b (Kepuasan Pengguna)
export const TAHUN_TRACER = {
  TS_4 : 2021,   // batas paling awal
  TS_3 : 2022,
  TS_2 : 2023,   // batas paling akhir yang boleh disurvey
};

// Opsi tahun lulus alumni untuk formulir alumni & employer
export const TAHUN_LULUS_OPTIONS = [
  { value: 2021, label: 'TS-4 (2021)' },
  { value: 2022, label: 'TS-3 (2022)' },
  { value: 2023, label: 'TS-2 (2023)' },
];

// ── Data Akademik Resmi (Tabel 2.8A LKPS) — diisi oleh Program Studi
//    Jumlah Lulusan PER TAHUN LULUS (bukan tahun masuk!)
//    Sumber: data wisuda/yudisium dari bagian akademik FPIK UNSRAT
//    ⚠️  Perbarui nilai ini setiap siklus akreditasi
//
//    CATATAN: Mahasiswa masuk 2021 (TS-4) umumnya lulus ~2025 (TS),
//    sehingga "jumlah lulusan tahun X" ≠ "jumlah mahasiswa masuk tahun X".
//    Kolom "Jumlah Mahasiswa Baru" di Tabel 2.8A berbeda dengan "Jumlah Lulusan"
//    di Tabel 2.8B. Isi nilai di bawah sesuai data wisuda yang sesungguhnya.
export const DATA_AKADEMIK = {
  // Jumlah lulusan per tahun kalender wisuda/yudisium
  // Sesuai LKPS Tabel 2.8B1 & 2.8B2 (TS-4 s.d. TS-2, untuk TS=2025)
  jumlah_lulusan: {
    [2021]: 0,   // TS-4 — isi sesuai data wisuda 2021
    [2022]: 0,   // TS-3 — isi sesuai data wisuda 2022
    [2023]: 0,   // TS-2 — isi sesuai data wisuda 2023
  },
  // Data dari Tabel 2.8A (mahasiswa aktif & mahasiswa baru) — untuk referensi
  mahasiswa_aktif: {
    [2021]: 131,   // TS-4
    [2022]: 124,   // TS-3
    [2023]: 120,   // TS-2
    [2024]: 122,   // TS-1
    [2025]: 119,   // TS
  },
  mahasiswa_baru: {
    [2021]: 23,    // TS-4
    [2022]: 19,    // TS-3
    [2023]: 35,    // TS-2
    [2024]: 40,    // TS-1
    [2025]: 27,    // TS
  },
};


export const CHART_COLORS = [
  '#003D5B','#006D77','#C5973A','#1B7A4A',
  '#7B5EA7','#C0392B','#17809B','#D97706','#2563EB','#834F00',
];
