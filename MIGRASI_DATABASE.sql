-- ══════════════════════════════════════════════════════════
--  MIGRASI DATABASE — Tracer Study MSP FPIK UNSRAT
--  Sesuai koreksi LKPS IAPS 1.0 LAM PTIP
--
--  Jalankan di Supabase SQL Editor:
--  https://supabase.com/dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════

-- ── 1. Tambah kolom alumni_tahun_lulus ke tabel ts_employer
--       Kolom ini wajib untuk Tabel 2.7b (Kepuasan Pengguna Lulusan)
--       agar data bisa dipilah per tahun lulus alumni (TS-4, TS-3, TS-2)

ALTER TABLE ts_employer
  ADD COLUMN IF NOT EXISTS alumni_tahun_lulus INTEGER;

COMMENT ON COLUMN ts_employer.alumni_tahun_lulus IS
  'Tahun lulus alumni yang dinilai. Sesuai LKPS LAM PTIP IAPS 1.0 Tabel 2.7b: '
  'hanya alumni yang lulus TS-4 s.d. TS-2 (untuk TS=2025: tahun 2021-2023).';


-- ── 2. Verifikasi kolom berhasil ditambahkan
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ts_employer'
  AND column_name = 'alumni_tahun_lulus';


-- ── 3. (Opsional) Isi data lama jika ada alumni_nama yang bisa dicocokkan
--       dengan tabel ts_alumni berdasarkan nama alumni
--       Uncomment dan sesuaikan jika diperlukan:
/*
UPDATE ts_employer e
SET alumni_tahun_lulus = a.lulus::INTEGER
FROM ts_alumni a
WHERE LOWER(TRIM(e.alumni_nama)) = LOWER(TRIM(a.nama))
  AND e.alumni_tahun_lulus IS NULL
  AND a.lulus IS NOT NULL
  AND a.lulus::INTEGER BETWEEN 2021 AND 2023;
*/


-- ── 4. Cek ringkasan data employer setelah migrasi
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
--    - Kolom baru alumni_tahun_lulus di ts_employer wajib diisi
--
--  Tabel 2.8b1 (Waktu Tunggu Lulusan):
--    - Responden  : Alumni sendiri
--    - Periode    : lulus TS-4, TS-3, TS-2
--    - Untuk TS=2025 : alumni lulus 2021, 2022, 2023
--    - Validasi tahun lulus sudah ditambahkan di formulir alumni.js
--
--  Tabel 2.7c (Kepuasan Stakeholder):
--    - Responden  : Semua stakeholder (mahasiswa, dosen, tendik, mitra, dll)
--    - Periode    : TS-2, TS-1, TS (= 2023, 2024, 2025)
--    - Kolom tahun_survei sudah ada di ts_stakeholder ✓
-- ══════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════
--  BAGIAN 6: Field "status" dihapus dari formulir alumni
--  Asumsi baru: SEMUA responden yang mengisi form dianggap
--  sudah bekerja. Field "status" tetap ada di tabel (untuk
--  kompatibilitas data lama) tapi tidak lagi diisi formulir.
-- ══════════════════════════════════════════════════════════

-- Pastikan kolom status nullable (seharusnya sudah nullable dari migrasi sebelumnya)
ALTER TABLE ts_alumni ALTER COLUMN status DROP NOT NULL;

-- (Opsional) Jika ingin membersihkan data status lama yang salah isi
-- karena field ini sudah tidak relevan, bisa di-set semua ke NULL:
-- UPDATE ts_alumni SET status = NULL;
-- Jalankan baris di atas HANYA jika ingin mengosongkan riwayat status lama.
