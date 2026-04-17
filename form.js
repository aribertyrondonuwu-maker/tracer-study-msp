// ══════════════════════════════════════════════════════════
//  form.js — Utilitas Form (radio, checkbox, rating)
// ══════════════════════════════════════════════════════════

// ── Nilai input
export const vv  = id => document.getElementById(id)?.value.trim() ?? '';
export const rad = name => document.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
export const chk = selector => [...document.querySelectorAll(`${selector}:checked`)].map(x => x.value);

// ── Rating button
export function selR(id, v) {
  document.querySelectorAll(`#${id} .rtg-btn`)
    .forEach(b => b.classList.toggle('sel', +b.dataset.v === v));
}
export function getR(id) {
  const s = document.querySelector(`#${id} .rtg-btn.sel`);
  return s ? +s.dataset.v : null;
}

// ── Render rating group (skala 4: Kurang, Cukup, Baik, Sangat Baik)
const RTG_LABELS = ['Kurang', 'Cukup', 'Baik', 'Sangat Baik'];

export function buildRatings(items, containerId) {
  document.getElementById(containerId).innerHTML = items.map(r => `
    <div class="f">
      <label>${r.lbl} <span class="req">*</span></label>
      <div class="rtg-grp" id="${r.id}">
        ${[1,2,3,4].map(n =>
          `<button type="button" class="rtg-btn"
            onclick="window._selR('${r.id}',${n})"
            data-v="${n}">${RTG_LABELS[n-1]}</button>`
        ).join('')}
      </div>
    </div>`).join('');
}

// ── Expose ke inline onclick (diperlukan karena ES module scope)
window._selR = selR;

// ── Aktifkan style radio/checkbox + hapus error saat diisi
export function initFormListeners() {
  document.addEventListener('change', e => {
    if (e.target.type === 'radio') {
      const g = e.target.closest('.rg');
      if (g) g.querySelectorAll('.ro').forEach(o =>
        o.classList.toggle('sel', o.querySelector('input').checked));
      // Hapus error highlight pada radio group
      const fWrap = e.target.closest('.f');
      if (fWrap) fWrap.classList.remove('f-err');
    }
    if (e.target.type === 'checkbox')
      e.target.closest('.co')?.classList.toggle('sel', e.target.checked);
  });

  // Hapus error highlight saat user mulai mengetik / memilih
  document.addEventListener('input', e => {
    const fWrap = e.target.closest('.f');
    if (fWrap) fWrap.classList.remove('f-err');
  });
  document.addEventListener('focus', e => {
    const fWrap = e.target.closest('.f');
    if (fWrap) fWrap.classList.remove('f-err');
  }, true);
}

// ── Helper: ambil label nama dari sebuah field
function getFieldLabel(id) {
  const el = document.getElementById(id);
  if (!el) return id;
  const fWrap = el.closest('.f');
  if (!fWrap) return id;
  const lbl = fWrap.querySelector('label');
  if (!lbl) return id;
  // Ambil teks label tanpa tanda bintang
  return lbl.textContent.replace('*','').trim();
}

// ── Highlight error pada field
function markFieldError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const fWrap = el.closest('.f');
  if (fWrap) fWrap.classList.add('f-err');
}

// ── Highlight error pada radio group
function markRadioError(name) {
  const radio = document.querySelector(`input[name="${name}"]`);
  if (!radio) return;
  const fWrap = radio.closest('.f');
  if (fWrap) fWrap.classList.add('f-err');
}

// ── Hapus semua error highlight dalam container
export function clearErrors(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.querySelectorAll('.f-err').forEach(el => el.classList.remove('f-err'));
}

// ── Scroll ke field pertama yang error
function scrollToFirstError() {
  const firstErr = document.querySelector('.f-err');
  if (firstErr) {
    firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ── Tampilkan pesan error inline (bukan alert)
function showInlineError(containerId, msg) {
  // Cari atau buat elemen error di atas tombol navigasi
  let errEl = document.getElementById(`${containerId}-val-err`);
  if (!errEl) {
    const fnav = document.querySelector(`#${containerId} .fnav`) ||
                 document.querySelector(`#${containerId}`)?.parentElement?.querySelector('.fnav');
    if (fnav) {
      errEl = document.createElement('div');
      errEl.id = `${containerId}-val-err`;
      errEl.className = 'info-box err';
      errEl.style.marginTop = '16px';
      fnav.parentElement.insertBefore(errEl, fnav);
    }
  }
  if (errEl) {
    errEl.innerHTML = `<strong>⚠️ Data belum lengkap</strong>${msg}`;
    errEl.style.display = 'block';
  }
}

// ── Sembunyikan pesan error inline
export function hideInlineError(containerId) {
  const errEl = document.getElementById(`${containerId}-val-err`);
  if (errEl) errEl.style.display = 'none';
}

// ══════════════════════════════════════════════════════════
//  Validasi field wajib — versi ditingkatkan
//  Menampilkan nama field, highlight merah, scroll otomatis
// ══════════════════════════════════════════════════════════
export function requireFields(ids = [], alertMsg = '') {
  const missing = [];

  ids.forEach(id => {
    if (!vv(id)) {
      missing.push({ id, label: getFieldLabel(id) });
      markFieldError(id);
    }
  });

  if (missing.length > 0) {
    const names = missing.map(m => `• ${m.label}`).join('\n');
    // Cari container step terdekat
    const firstEl = document.getElementById(missing[0].id);
    const stepContainer = firstEl?.closest('.fc');
    if (stepContainer) {
      showInlineError(stepContainer.id,
        `<br>Mohon lengkapi field berikut:<br>${missing.map(m => `<span style="display:inline-block;margin:2px 0">— ${m.label}</span>`).join('<br>')}`
      );
    }
    scrollToFirstError();
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════
//  Validasi radio wajib — dengan highlight & scroll
// ══════════════════════════════════════════════════════════
export function requireRadio(name, label = '') {
  if (!rad(name)) {
    markRadioError(name);
    const radio = document.querySelector(`input[name="${name}"]`);
    const fWrap = radio?.closest('.f');
    const fieldLabel = label || (fWrap?.querySelector('label')?.textContent.replace('*','').trim()) || name;

    const stepContainer = radio?.closest('.fc');
    if (stepContainer) {
      showInlineError(stepContainer.id,
        `<br>Mohon pilih: <strong>${fieldLabel}</strong>`
      );
    }
    scrollToFirstError();
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════
//  Validasi select wajib — dengan highlight & scroll
// ══════════════════════════════════════════════════════════
export function requireSelect(id, label = '') {
  if (!vv(id)) {
    markFieldError(id);
    const fieldLabel = label || getFieldLabel(id);

    const el = document.getElementById(id);
    const stepContainer = el?.closest('.fc');
    if (stepContainer) {
      showInlineError(stepContainer.id,
        `<br>Mohon pilih: <strong>${fieldLabel}</strong>`
      );
    }
    scrollToFirstError();
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════
//  Validasi gabungan — cek semua sekaligus
// ══════════════════════════════════════════════════════════
export function validateStep(checks = []) {
  // checks = [{ type:'field'|'radio'|'select', id/name, label }]
  const errors = [];

  checks.forEach(c => {
    if (c.type === 'field' && !vv(c.id)) {
      markFieldError(c.id);
      errors.push(c.label || getFieldLabel(c.id));
    } else if (c.type === 'radio' && !rad(c.name)) {
      markRadioError(c.name);
      errors.push(c.label || c.name);
    } else if (c.type === 'select' && !vv(c.id)) {
      markFieldError(c.id);
      errors.push(c.label || getFieldLabel(c.id));
    }
  });

  if (errors.length > 0) {
    // Cari container step
    const firstCheck = checks.find(c => c.type === 'field' || c.type === 'select')
      ? document.getElementById(checks[0].id || '')
      : document.querySelector(`input[name="${checks[0].name}"]`);
    const stepContainer = firstCheck?.closest('.fc');
    if (stepContainer) {
      showInlineError(stepContainer.id,
        `<br>Mohon lengkapi field berikut:<br>${errors.map(e => `<span style="display:inline-block;margin:2px 0">— ${e}</span>`).join('<br>')}`
      );
    }
    scrollToFirstError();
    return false;
  }
  return true;
}
