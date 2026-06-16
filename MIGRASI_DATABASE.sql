-- ══════════════════════════════════════════════════════════
--  MIGRASI DATABASE — Tracer Study MSP FPIK UNSRAT
--  Versi: Efisiensi Formulir Alumni (sesuai keputusan review)
--
--  Jalankan di Supabase SQL Editor:
--  https://supabase.com/dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════
--  BAGIAN 1: TABEL ts_employer
--  Tambah kolom alumni_tahun_lulus (sudah ada di versi sebelumnya)
-- ══════════════════════════════════════════════════════════

ALTER TABLE ts_employer
  ADD COLUMN IF NOT EXISTS alumni_tahun_lulus INTEGER;

COMMENT ON COLUMN ts_employer.alumni_tahun_lulus IS
  'Tahun lulus alumni yang dinilai. Sesuai LKPS LAM PTIP IAPS 1.0 Tabel 2.7b: '
  'hanya alumni yang lulus TS-4 s.d. TS-2 (untuk TS=2025: tahun 2021-2023).';


-- ══════════════════════════════════════════════════════════
--  BAGIAN 2: TABEL ts_alumni
--  Kolom yang DIHAPUS dari formulir (data lama tetap tersimpan,
--  kolom tidak perlu di-drop — biarkan nullable untuk kompatibilitas)
-- ══════════════════════════════════════════════════════════
--
--  Kolom yang TIDAK lagi diisi dari formulir baru:
--    - masuk         (tahun masuk — ada di data PS)
--    - email         (tidak diperlukan)
--    - hp            (ada di grup WA alumni)
--    - gender        (tidak ada tabel LKPS yang membutuhkan)
--    - ipk           (ada di data PS)
--    - judul         (tidak ada tabel LKPS)
--    - instansi      (nama instansi — dihapus)
--    - jabatan       (jabatan/posisi — dihapus)
--    - kota          (kota/provinsi — dihapus)
--    - sumber        (sumber informasi lowongan — dihapus)
--    - kompetensi    (kompetensi bermanfaat — dihapus)
--    - perlu         (kompetensi perlu ditingkatkan — dihapus)
--    - metode        (metode pembelajaran — dihapus)
--    - saran_kur     (saran kurikulum — dihapus)
--    - saran_fas     (saran fasilitas — dihapus)
--    - rekomendasi   (rekomendasi prodi — dihapus)
--    - pesan         (pesan untuk mahasiswa — dihapus)
--
--  Kolom yang TETAP DIISI (inti LKPS):
--    - nama          → identifikasi responden
--    - nim           → verifikasi data
--    - lulus         → Tabel 2.8B1 & 2.8B2 (TS-4/TS-3/TS-2)
--    - status        → Tabel 2.8B1 (status pekerjaan)
--    - tunggu        → Tabel 2.8B1 (waktu tunggu)
--    - bidang        → Tabel 2.8B2 (sektor pekerjaan)
--    - level_kerja   → Tabel 2.8B2 (lokal/nasional/multinasional)
--    - gaji          → opsional (narasi LED, bukan tabel LKPS wajib)
--    - kesesuaian    → Tabel 2.8B2 (kesesuaian bidang kerja)
--    - rtg_ar1..ar7  → penilaian alumni terhadap 7 aspek layanan prodi


-- ══════════════════════════════════════════════════════════
--  BAGIAN 3: Pastikan kolom gaji bersifat nullable
--  (karena sekarang gaji bersifat opsional di formulir)
-- ══════════════════════════════════════════════════════════

ALTER TABLE ts_alumni
  ALTER COLUMN gaji DROP NOT NULL;


-- ══════════════════════════════════════════════════════════
--  BAGIAN 4: Verifikasi struktur tabel
-- ══════════════════════════════════════════════════════════

-- Verifikasi kolom ts_employer
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ts_employer'
  AND column_name = 'alumni_tahun_lulus';

-- Verifikasi kolom inti ts_alumni masih ada
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ts_alumni'
  AND column_name IN ('nama','nim','lulus','status','tunggu','bidang','level_kerja','gaji','kesesuaian')
ORDER BY column_name;


-- ══════════════════════════════════════════════════════════
--  BAGIAN 5: Cek ringkasan data setelah migrasi
-- ══════════════════════════════════════════════════════════

SELECT
  lulus AS tahun_lulus,
  COUNT(*) AS jumlah_responden
FROM ts_alumni
GROUP BY lulus
ORDER BY lulus;

SELECT
  alumni_tahun_lulus,
  COUNT(*) AS jumlah_responden
FROM ts_employer
GROUP BY alumni_tahun_lulus
ORDER BY alumni_tahun_lulus;


-- ══════════════════════════════════════════════════════════
--  CATATAN KONSISTENSI DATA (LKPS LAM PTIP IAPS 1.0)
-- ══════════════════════════════════════════════════════════
--
--  Tabel 2.7b (Kepuasan Pengguna Lulusan):
--    - Responden  : Atasan/HRD (bukan alumni sendiri)
--    - Alumni dinilai : lulus TS-4, TS-3, TS-2
--    - Untuk TS=2025 : alumni lulus 2021, 2022, 2023
--
--  Tabel 2.8b1 (Waktu Tunggu Lulusan):
--    - Responden  : Alumni sendiri
--    - Periode    : lulus TS-4, TS-3, TS-2
--    - Untuk TS=2025 : alumni lulus 2021, 2022, 2023
--
--  Tabel 2.7c (Kepuasan Stakeholder):
--    - Responden  : Semua stakeholder (mahasiswa, dosen, tendik, mitra, dll)
--    - Periode    : TS-2, TS-1, TS (= 2023, 2024, 2025)
-- ══════════════════════════════════════════════════════════
