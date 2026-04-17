// ══════════════════════════════════════════════════════════
//  alumni.js — Formulir Alumni (5 Langkah)
//  Data → Tabel 2.8B1 (Waktu Tunggu) & 2.8B2 (Kesesuaian)
// ══════════════════════════════════════════════════════════

import { db }            from './db.js';
import { TBL_ALUMNI, ASPEK_PRODI } from './config.js';
import { vv, rad, chk, getR, buildRatings, requireFields, validateStep, requireRadio, hideInlineError } from './form.js';
import { router }        from './app.js';

const TOTAL_STEPS = 5;

// ── Init: render rating & reset form
export function initAlumni() {
  buildRatings(ASPEK_PRODI, 'rtg-alumni');
  resetAlumni();
}

function resetAlumni() {
  // Reset semua input
  document.querySelectorAll('#screen-alumni input, #screen-alumni select, #screen-alumni textarea')
    .forEach(el => {
      if (el.type !== 'radio' && el.type !== 'checkbox') el.value = '';
      el.checked = false;
    });
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
      hideInlineError('a-s1');
      if (!requireFields(['a-nama','a-nim','a-masuk','a-lulus','a-email','a-gender'])) return;
      return aGo(2);

    case 2: {
      hideInlineError('a-s2');
      const ok = validateStep([
        { type:'radio',  name:'astatus', label:'Status Pekerjaan Saat Ini' },
        { type:'select', id:'a-tunggu',  label:'Waktu Tunggu Mendapat Pekerjaan' },
        { type:'select', id:'a-bidang',  label:'Bidang / Sektor Pekerjaan' },
        { type:'select', id:'a-gaji',    label:'Kisaran Gaji / Penghasilan' },
      ]);
      if (!ok) return;
      return aGo(3);
    }

    case 3:
      hideInlineError('a-s3');
      if (!requireRadio('asesuai', 'Tingkat Kesesuaian Pekerjaan')) return;
      return aGo(4);

    case 4: {
      hideInlineError('a-s4');
      const miss = ASPEK_PRODI.find(r => getR(r.id) === null);
      if (miss) {
        // Highlight rating group yang belum diisi
        ASPEK_PRODI.forEach(r => {
          if (getR(r.id) === null) {
            const grp = document.getElementById(r.id);
            if (grp) grp.closest('.f')?.classList.add('f-err');
          }
        });
        const stepEl = document.getElementById('a-s4');
        if (stepEl) {
          let errEl = document.getElementById('a-s4-val-err');
          if (!errEl) {
            const fnav = stepEl.querySelector('.fnav');
            if (fnav) {
              errEl = document.createElement('div');
              errEl.id = 'a-s4-val-err';
              errEl.className = 'info-box err';
              errEl.style.marginTop = '16px';
              fnav.parentElement.insertBefore(errEl, fnav);
            }
          }
          if (errEl) {
            errEl.innerHTML = '<strong>⚠️ Data belum lengkap</strong><br>Mohon lengkapi semua penilaian program studi.';
            errEl.style.display = 'block';
          }
        }
        document.querySelector('.f-err')?.scrollIntoView({ behavior:'smooth', block:'center' });
        return;
      }
      return aGo(5);
    }
  }
}

// ── Submit ke Supabase
export async function submitAlumni() {
  if (!rad('arekom')) {
    const stepEl = document.getElementById('a-s5');
    if (stepEl) {
      const radio = document.querySelector('input[name="arekom"]');
      radio?.closest('.f')?.classList.add('f-err');
      let errEl = document.getElementById('a-s5-val-err');
      if (!errEl) {
        const fnav = stepEl.querySelector('.fnav');
        if (fnav) {
          errEl = document.createElement('div');
          errEl.id = 'a-s5-val-err';
          errEl.className = 'info-box err';
          errEl.style.marginTop = '16px';
          fnav.parentElement.insertBefore(errEl, fnav);
        }
      }
      if (errEl) {
        errEl.innerHTML = '<strong>⚠️ Data belum lengkap</strong><br>Mohon pilih apakah Anda merekomendasikan Prodi MSP.';
        errEl.style.display = 'block';
      }
      document.querySelector('.f-err')?.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    return;
  }

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
