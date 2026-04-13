// ══════════════════════════════════════════════════════════
//  alumni.js — Formulir Alumni (5 Langkah)
//  Data → Tabel 2.8B1 (Waktu Tunggu) & 2.8B2 (Kesesuaian)
// ══════════════════════════════════════════════════════════

import { db }            from './db.js';
import { TBL_ALUMNI, ASPEK_PRODI } from './config.js';
import { vv, rad, chk, getR, buildRatings, requireFields } from './form.js';
import { router }        from '../app.js';

const TOTAL_STEPS = 5;

// ── Init: render rating & reset form
export function initAlumni() {
  buildRatings(ASPEK_PRODI, 'rtg-alumni');
  resetAlumni();
}

function resetAlumni() {
  // Reset semua input
  document.querySelectorAll('#screen-alumni input, #screen-alumni select, #screen-alumni textarea')
    .forEach(el => { el.value = ''; el.checked = false; });
  document.querySelectorAll('#screen-alumni .ro.sel, #screen-alumni .co.sel, #screen-alumni .rtg-btn.sel')
    .forEach(el => el.classList.remove('sel'));
  aGo(1);
}

// ── Navigasi langkah
export function aGo(step) {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const el = document.getElementById(`a-s${i}`);
    if (el) el.style.display = i === step ? 'block' : 'none';
  }
  document.getElementById('a-lbl').textContent = `Langkah ${step} dari ${TOTAL_STEPS}`;
  document.getElementById('a-prog').style.width = (step / TOTAL_STEPS * 100) + '%';
  window.scrollTo(0, 0);
}

// ── Validasi & lanjut per langkah
export function aNext(from) {
  switch (from) {
    case 1:
      if (!requireFields(['a-nama','a-nim','a-masuk','a-lulus','a-email','a-gender'])) return;
      return aGo(2);

    case 2:
      if (!rad('astatus') || !vv('a-tunggu') || !vv('a-bidang') || !vv('a-gaji')) {
        return alert('Mohon lengkapi semua field wajib (*).');
      }
      return aGo(3);

    case 3:
      if (!rad('asesuai')) return alert('Mohon pilih tingkat kesesuaian pekerjaan.');
      return aGo(4);

    case 4: {
      const miss = ASPEK_PRODI.find(r => getR(r.id) === null);
      if (miss) return alert('Mohon lengkapi semua penilaian program studi.');
      return aGo(5);
    }
  }
}

// ── Submit ke Supabase
export async function submitAlumni() {
  if (!rad('arekom')) return alert('Mohon pilih apakah Anda merekomendasikan Prodi MSP.');

  const btn    = document.getElementById('btn-submit-alumni');
  const errBox = document.getElementById('a-submit-err');
  btn.disabled = true;
  btn.textContent = '⏳ Mengirim...';
  errBox.style.display = 'none';

  const payload = {
    nama       : vv('a-nama'),
    nim        : vv('a-nim'),
    masuk      : vv('a-masuk'),
    lulus      : vv('a-lulus'),
    email      : vv('a-email'),
    hp         : vv('a-hp'),
    gender     : vv('a-gender'),
    ipk        : vv('a-ipk'),
    judul      : vv('a-judul'),
    status     : rad('astatus'),
    tunggu     : vv('a-tunggu'),
    instansi   : vv('a-instansi'),
    jabatan    : vv('a-jabatan'),
    kota       : vv('a-kota'),
    bidang     : vv('a-bidang'),
    level_kerja: vv('a-level-kerja'),
    gaji       : vv('a-gaji'),
    kesesuaian : rad('asesuai'),
    sumber     : rad('asumber'),
    kompetensi : chk('#a-komp input').join('; '),
    perlu      : vv('a-perlu'),
    // Rating prodi (7 aspek)
    rtg_ar1 : getR('ar1'), rtg_ar2 : getR('ar2'), rtg_ar3 : getR('ar3'),
    rtg_ar4 : getR('ar4'), rtg_ar5 : getR('ar5'), rtg_ar6 : getR('ar6'),
    rtg_ar7 : getR('ar7'),
    metode      : chk('#a-metode input').join('; '),
    saran_kur   : vv('a-saran-kur'),
    saran_fas   : vv('a-saran-fas'),
    rekomendasi : rad('arekom'),
    pesan       : vv('a-pesan'),
  };

  const { error } = await db.from(TBL_ALUMNI).insert(payload);

  if (error) {
    errBox.innerHTML = `<strong>Gagal mengirim data.</strong> ${error.message}
      <br><small>Cek koneksi internet atau konfigurasi Supabase.</small>`;
    errBox.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '✅ Kirim Formulir';
  } else {
    router.go('success');
  }
}

// ── Expose ke HTML (onclick)
window._aGo   = aGo;
window._aNext = aNext;
window._submitAlumni = submitAlumni;
