// ══════════════════════════════════════════════════════════
//  stakeholder.js — Formulir Kepuasan Stakeholder (Tabel 2.7C)
//  Responden: Mahasiswa, Dosen, Tendik, Mitra, Lulusan,
//             Pengguna Lulusan, Lainnya
//  Skala: SB=4, B=3, C=2, K=1
// ══════════════════════════════════════════════════════════

import { db }     from './db.js';
import { TBL_STAKEHOLDER, TAHUN_OPTIONS } from './config.js';
import { vv, rad, requireFields } from './form.js';
import { router } from './app.js';

const TOTAL_STEPS = 3;

// ── Aspek kepuasan layanan prodi (sesuai LAM PTIP 2.7C)
export const ASPEK_KEPUASAN = [
  { id:'sk1', lbl:'Kualitas Pengajaran & Pembelajaran' },
  { id:'sk2', lbl:'Relevansi Kurikulum dengan Kebutuhan' },
  { id:'sk3', lbl:'Kualitas Fasilitas & Sarana Pendukung' },
  { id:'sk4', lbl:'Pelayanan Akademik & Administrasi' },
  { id:'sk5', lbl:'Kompetensi & Profesionalisme SDM (Dosen/Tendik)' },
  { id:'sk6', lbl:'Suasana Akademik & Kegiatan Kemahasiswaan' },
  { id:'sk7', lbl:'Kerjasama & Kemitraan Prodi' },
];

// ── Init
export function initStakeholder() {
  buildKepuasanRatings();
  resetStakeholder();
}

function resetStakeholder() {
  document.querySelectorAll('#screen-stakeholder input, #screen-stakeholder select, #screen-stakeholder textarea')
    .forEach(el => {
      if (el.type !== 'radio' && el.type !== 'checkbox') el.value = '';
      el.checked = false;
    });
  document.querySelectorAll('#screen-stakeholder .ro.sel, #screen-stakeholder .rtg-btn.sel')
    .forEach(el => el.classList.remove('sel'));
  sGo(1);
}

function buildKepuasanRatings() {
  const LABELS = ['Kurang', 'Cukup', 'Baik', 'Sangat Baik'];
  document.getElementById('rtg-stakeholder').innerHTML = ASPEK_KEPUASAN.map(r => `
    <div class="f">
      <label>${r.lbl} <span class="req">*</span></label>
      <div class="rtg-grp" id="${r.id}">
        ${[1,2,3,4].map(n =>
          `<button type="button" class="rtg-btn"
            onclick="window._selR('${r.id}',${n})"
            data-v="${n}">${LABELS[n-1]}</button>`
        ).join('')}
      </div>
    </div>`).join('');
}

// ── Navigasi langkah
export function sGo(step) {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const el = document.getElementById(`sk-s${i}`);
    if (el) el.style.display = i === step ? 'block' : 'none';
  }
  document.getElementById('sk-lbl').textContent = `Langkah ${step} dari ${TOTAL_STEPS}`;
  document.getElementById('sk-prog').style.width = (step / TOTAL_STEPS * 100) + '%';
  window.scrollTo(0, 0);
}

// ── Validasi & lanjut
export function sNext(from) {
  switch (from) {
    case 1:
      if (!rad('sk-jenis')) return alert('Mohon pilih jenis stakeholder Anda.');
      if (!vv('sk-tahun')) return alert('Mohon pilih tahun survei.');
      if (!requireFields(['sk-nama', 'sk-instansi'])) return;
      return sGo(2);

    case 2: {
      const miss = ASPEK_KEPUASAN.find(r => {
        const sel = document.querySelector(`#${r.id} .rtg-btn.sel`);
        return !sel;
      });
      if (miss) return alert('Mohon lengkapi semua penilaian aspek layanan.');
      return sGo(3);
    }
  }
}

// ── Helpers rating
function getSkR(id) {
  const s = document.querySelector(`#${id} .rtg-btn.sel`);
  return s ? +s.dataset.v : null;
}

// ── Submit ke Supabase
export async function submitStakeholder() {
  if (!rad('sk-puas')) return alert('Mohon pilih tingkat kepuasan keseluruhan.');

  const btn    = document.getElementById('btn-submit-stakeholder');
  const errBox = document.getElementById('sk-submit-err');
  btn.disabled = true;
  btn.textContent = '⏳ Mengirim...';
  errBox.style.display = 'none';

  const payload = {
    tahun_survei : parseInt(vv('sk-tahun')),
    jenis        : rad('sk-jenis'),
    nama         : vv('sk-nama'),
    instansi     : vv('sk-instansi'),
    email        : vv('sk-email'),
    // 7 aspek penilaian
    rtg_sk1 : getSkR('sk1'), rtg_sk2 : getSkR('sk2'), rtg_sk3 : getSkR('sk3'),
    rtg_sk4 : getSkR('sk4'), rtg_sk5 : getSkR('sk5'), rtg_sk6 : getSkR('sk6'),
    rtg_sk7 : getSkR('sk7'),
    kepuasan   : rad('sk-puas'),
    saran      : vv('sk-saran'),
    harapan    : vv('sk-harapan'),
  };

  const { error } = await db.from(TBL_STAKEHOLDER).insert(payload);

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

// ── Expose ke HTML
window._sGo              = sGo;
window._sNext            = sNext;
window._submitStakeholder = submitStakeholder;
