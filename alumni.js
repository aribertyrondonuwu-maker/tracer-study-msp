// ══════════════════════════════════════════════════════════
//  alumni.js — Formulir Alumni (5 Langkah)
//  Data → Tabel 2.8B1 (Waktu Tunggu) & 2.8B2 (Kesesuaian)
// ══════════════════════════════════════════════════════════

import { db }            from './db.js';
import { TBL_ALUMNI, ASPEK_PRODI, TAHUN_TRACER } from './config.js';
import { vv, rad, getR, buildRatings, requireFields, validateStep, requireRadio, hideInlineError } from './form.js';
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

// ── Helper: tampilkan pesan error tahun di dalam step
function _showYearError(stepId, errId, html) {
  const stepEl = document.getElementById(stepId);
  if (!stepEl) return;
  let errEl = document.getElementById(errId);
  if (!errEl) {
    const fnav = stepEl.querySelector('.fnav');
    if (fnav) {
      errEl = document.createElement('div');
      errEl.id = errId;
      errEl.className = 'info-box err';
      errEl.style.marginTop = '16px';
      fnav.parentElement.insertBefore(errEl, fnav);
    }
  }
  if (errEl) { errEl.innerHTML = html; errEl.style.display = 'block'; }
}

// ── Validasi & lanjut per langkah
export function aNext(from) {
  switch (from) {
    case 1: {
      hideInlineError('a-s1');
      if (!requireFields(['a-nama','a-nim','a-lulus'])) return;

      // ── Validasi tahun lulus: hanya alumni TS-4 s.d. TS-2 yang disurvey
      //    Sesuai LKPS IAPS 1.0 LAM PTIP Tabel 2.8b1 (Program Sarjana)
      const tahunLulus = parseInt(vv('a-lulus'));
      if (isNaN(tahunLulus)) {
        _showYearError('a-s1', 'a-s1-val-err',
          '<strong>⚠️ Tahun lulus tidak valid.</strong><br>Masukkan tahun lulus dalam format angka (contoh: 2022).');
        document.getElementById('a-lulus')?.closest('.f')?.classList.add('f-err');
        return;
      }
      if (tahunLulus < TAHUN_TRACER.TS_4 || tahunLulus > TAHUN_TRACER.TS_2) {
        _showYearError('a-s1', 'a-s1-val-err',
          `<strong>⚠️ Tahun lulus di luar cakupan survei.</strong><br>
           Formulir ini hanya untuk alumni yang lulus
           <strong>${TAHUN_TRACER.TS_4}–${TAHUN_TRACER.TS_2}</strong>
           (TS-4 s.d. TS-2), sesuai LKPS LAM PTIP IAPS 1.0 Tabel 2.8b1.<br>
           <span style="font-size:11px;color:var(--g500)">
             Alumni lulus ${TAHUN_TRACER.TS_2 + 1} (TS-1) atau ${TAHUN_TRACER.TS_2 + 2} (TS)
             belum termasuk dalam periode tracer study ini.
           </span>`);
        document.getElementById('a-lulus')?.closest('.f')?.classList.add('f-err');
        document.getElementById('a-lulus')?.scrollIntoView({ behavior:'smooth', block:'center' });
        return;
      }
      return aGo(2);
    }

    case 2: {
      hideInlineError('a-s2');
      const ok = validateStep([
        { type:'radio',  name:'astatus', label:'Status Pekerjaan Saat Ini' },
        { type:'select', id:'a-tunggu',  label:'Waktu Tunggu Mendapat Pekerjaan' },
        { type:'select', id:'a-bidang',  label:'Bidang / Sektor Pekerjaan' },
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
  const btn    = document.getElementById('btn-submit-alumni');
  const errBox = document.getElementById('a-submit-err');
  btn.disabled = true;
  btn.textContent = '⏳ Mengirim...';
  errBox.style.display = 'none';

  const payload = {
    nama       : vv('a-nama'),
    nim        : vv('a-nim'),
    lulus      : vv('a-lulus'),
    status     : rad('astatus'),
    tunggu     : vv('a-tunggu'),
    bidang     : vv('a-bidang'),
    level_kerja: vv('a-level-kerja'),
    gaji       : vv('a-gaji') || null,
    kesesuaian : rad('asesuai'),
    // Rating prodi (7 aspek)
    rtg_ar1 : getR('ar1'), rtg_ar2 : getR('ar2'), rtg_ar3 : getR('ar3'),
    rtg_ar4 : getR('ar4'), rtg_ar5 : getR('ar5'), rtg_ar6 : getR('ar6'),
    rtg_ar7 : getR('ar7'),
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
