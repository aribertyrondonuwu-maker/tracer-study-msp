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

// ── Render rating group
export function buildRatings(items, containerId) {
  document.getElementById(containerId).innerHTML = items.map(r => `
    <div class="f">
      <label>${r.lbl} <span class="req">*</span></label>
      <div class="rtg-grp" id="${r.id}">
        ${[1,2,3,4,5].map(n =>
          `<button type="button" class="rtg-btn"
            onclick="window._selR('${r.id}',${n})"
            data-v="${n}">${n}</button>`
        ).join('')}
      </div>
      <div class="rtg-lbl"><span>Sangat Kurang</span><span>Sangat Baik</span></div>
    </div>`).join('');
}

// ── Expose ke inline onclick (diperlukan karena ES module scope)
window._selR = selR;

// ── Aktifkan style radio/checkbox
export function initFormListeners() {
  document.addEventListener('change', e => {
    if (e.target.type === 'radio') {
      const g = e.target.closest('.rg');
      if (g) g.querySelectorAll('.ro').forEach(o =>
        o.classList.toggle('sel', o.querySelector('input').checked));
    }
    if (e.target.type === 'checkbox')
      e.target.closest('.co')?.classList.toggle('sel', e.target.checked);
  });
}

// ── Validasi field wajib (kembalikan true jika valid)
export function requireFields(ids = [], alertMsg = 'Mohon lengkapi semua field wajib (*).') {
  const empty = ids.some(id => !vv(id));
  if (empty) { alert(alertMsg); return false; }
  return true;
}
