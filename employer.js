// ══════════════════════════════════════════════════════════
//  employer.js — Formulir Pengguna Lulusan (3 Langkah)
//  Data → Tabel 2.7B LAM PTIP (7 Aspek Kompetensi)
// ══════════════════════════════════════════════════════════

import { db }            from './db.js';
import { TBL_EMPLOYER, ASPEK_LAM } from './config.js';
import { vv, rad, getR, buildRatings, requireFields, requireRadio, hideInlineError } from './form.js';
import { router }        from './app.js';

const TOTAL_STEPS = 3;

// ── Init
export function initEmployer() {
  buildRatings(ASPEK_LAM, 'rtg-employer');
  resetEmployer();
}

function resetEmployer() {
  document.querySelectorAll('#screen-employer input, #screen-employer select, #screen-employer textarea')
    .forEach(el => {
      if (el.type !== 'radio' && el.type !== 'checkbox') el.value = '';
      el.checked = false;
    });
  document.querySelectorAll('#screen-employer .ro.sel, #screen-employer .rtg-btn.sel')
    .forEach(el => el.classList.remove('sel'));
  eGo(1);
}

// ── Navigasi
export function eGo(step) {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const el = document.getElementById(`e-s${i}`);
    if (el) el.style.display = i === step ? 'block' : 'none';
  }
  document.getElementById('e-lbl').textContent = `Langkah ${step} dari ${TOTAL_STEPS}`;
  document.getElementById('e-prog').style.width = (step / TOTAL_STEPS * 100) + '%';
  window.scrollTo(0, 0);
}

// ── Validasi & lanjut
export function eNext(from) {
  switch (from) {
    case 1:
      hideInlineError('e-s1');
      if (!requireFields(['e-inst','e-sektor','e-kota','e-pengisi','e-jabpengisi','e-email'])) return;
      return eGo(2);

    case 2: {
      hideInlineError('e-s2');
      const miss = ASPEK_LAM.find(r => getR(r.id) === null);
      if (miss) {
        ASPEK_LAM.forEach(r => {
          if (getR(r.id) === null) {
            const grp = document.getElementById(r.id);
            if (grp) grp.closest('.f')?.classList.add('f-err');
          }
        });
        const stepEl = document.getElementById('e-s2');
        if (stepEl) {
          let errEl = document.getElementById('e-s2-val-err');
          if (!errEl) {
            const fnav = stepEl.querySelector('.fnav');
            if (fnav) {
              errEl = document.createElement('div');
              errEl.id = 'e-s2-val-err';
              errEl.className = 'info-box err';
              errEl.style.marginTop = '16px';
              fnav.parentElement.insertBefore(errEl, fnav);
            }
          }
          if (errEl) {
            errEl.innerHTML = '<strong>⚠️ Data belum lengkap</strong><br>Mohon lengkapi semua 7 aspek penilaian kompetensi alumni.';
            errEl.style.display = 'block';
          }
        }
        document.querySelector('.f-err')?.scrollIntoView({ behavior:'smooth', block:'center' });
        return;
      }
      return eGo(3);
    }
  }
}

// ── Submit ke Supabase
export async function submitEmployer() {
  if (!requireRadio('epuas', 'Tingkat Kepuasan Keseluruhan')) return;

  const btn    = document.getElementById('btn-submit-employer');
  const errBox = document.getElementById('e-submit-err');
  btn.disabled = true;
  btn.textContent = '⏳ Mengirim...';
  errBox.style.display = 'none';

  const payload = {
    instansi    : vv('e-inst'),
    sektor      : vv('e-sektor'),
    kota        : vv('e-kota'),
    pengisi     : vv('e-pengisi'),
    jab_pengisi : vv('e-jabpengisi'),
    email       : vv('e-email'),
    telp        : vv('e-telp'),
    alumni_nama : vv('e-alum'),
    alumni_jab  : vv('e-alum-jab'),
    lama        : vv('e-lama'),
    // 7 Aspek LAM PTIP Tabel 2.7B
    rtg_er1 : getR('er1'), rtg_er2 : getR('er2'), rtg_er3 : getR('er3'),
    rtg_er4 : getR('er4'), rtg_er5 : getR('er5'), rtg_er6 : getR('er6'),
    rtg_er7 : getR('er7'),
    kepuasan : rad('epuas'),
    rekrut   : rad('erekrut'),
    saran    : vv('e-saran'),
    pesan    : vv('e-pesan'),
  };

  const { error } = await db.from(TBL_EMPLOYER).insert(payload);

  if (error) {
    errBox.innerHTML = `<strong>Gagal mengirim data.</strong> ${error.message}`;
    errBox.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '✅ Kirim Formulir';
  } else {
    router.go('success');
  }
}

// ── Expose ke HTML
window._eGo   = eGo;
window._eNext = eNext;
window._submitEmployer = submitEmployer;
