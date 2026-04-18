// ══════════════════════════════════════════════════════════
//  app.js — Controller Utama & Router
//  Tracer Study MSP FPIK UNSRAT — LAM PTIP IAPS 1.0
// ══════════════════════════════════════════════════════════

import { initFormListeners }          from './form.js';
import { initAlumni, aGo, aNext, submitAlumni }    from './alumni.js';
import { initEmployer, eGo, eNext, submitEmployer } from './employer.js';
import { initStakeholder, sGo, sNext, submitStakeholder } from './stakeholder.js';
import { admLogin, admLogout, applyRoleUI }         from './auth.js';
import { admTab, addAdmin, generateAINarasi,
         exportCSV, exportExcel, printLaporan }     from './admin.js';
import { db } from './db.js';
import { TBL_ALUMNI, TBL_EMPLOYER, TBL_STAKEHOLDER, ASPEK_LAM, CHART_COLORS } from './config.js';

// ══════════════════════════════════════════════════════════
//  ROUTER
// ══════════════════════════════════════════════════════════
export const router = {
  current: 'landing',

  go(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${screenId}`);
    if (target) target.classList.add('active');
    document.getElementById('btnBack').style.display =
      screenId === 'landing' ? 'none' : 'block';
    window.scrollTo(0, 0);
    this.current = screenId;
  },

  goHome() { this.go('landing'); },

  startForm(role) {
    if (role === 'alumni') {
      initAlumni();
      this.go('alumni');
    } else if (role === 'stakeholder') {
      initStakeholder();
      this.go('stakeholder');
    } else {
      initEmployer();
      this.go('employer');
    }
  },

  showAdmin() {
    this.go('admin-login');
    setTimeout(() => document.getElementById('adm-pass')?.focus(), 120);
  },
};

// ══════════════════════════════════════════════════════════
//  STATISTIK PUBLIK
// ══════════════════════════════════════════════════════════
let _statCharts = {};

function destroyStatCharts() {
  Object.values(_statCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  _statCharts = {};
}

export async function loadStatistik() {
  destroyStatCharts();
  document.getElementById('stat-loading-state').style.display = 'block';
  document.getElementById('stat-content').style.display = 'none';

  const [{ data: al }, { data: em }, { data: sk }] = await Promise.all([
    db.from(TBL_ALUMNI).select('status,tunggu,kesesuaian,bidang,level_kerja'),
    db.from(TBL_EMPLOYER).select('kepuasan,rtg_er1,rtg_er2,rtg_er3,rtg_er4,rtg_er5,rtg_er6,rtg_er7'),
    db.from(TBL_STAKEHOLDER).select('jenis,kepuasan,rtg_sk1,rtg_sk2,rtg_sk3,rtg_sk4,rtg_sk5,rtg_sk6,rtg_sk7'),
  ]);

  const a = al || [], e = em || [], s = sk || [];

  // Summary cards
  const bekerja = a.filter(x => x.status && !x.status.includes('Belum') && !x.status.includes('Studi')).length;
  const pctKerja = a.length ? Math.round(bekerja / a.length * 100) : 0;
  const lt6 = a.filter(x => x.tunggu && x.tunggu.includes('<')).length;
  const pctLt6 = a.length ? Math.round(lt6 / a.length * 100) : 0;
  const relevan = a.filter(x => ['Sangat Erat','Erat'].includes(x.kesesuaian)).length;
  const pctRelevan = bekerja ? Math.round(relevan / bekerja * 100) : 0;

  let avg7 = '–';
  if (e.length) {
    const keys = ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7'];
    const tot = e.reduce((s,r) => s + keys.reduce((ss,k) => ss+(r[k]||0), 0), 0);
    avg7 = (tot / (e.length * keys.length)).toFixed(2);
  }

  // Rata-rata kepuasan stakeholder
  let avgSk = '–';
  if (s.length) {
    const skKeys = ['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7'];
    const totSk = s.reduce((sum,r) => sum + skKeys.reduce((ss,k) => ss+(r[k]||0), 0), 0);
    avgSk = (totSk / (s.length * skKeys.length)).toFixed(2);
  }

  document.getElementById('stat-summary-grid').innerHTML = `
    <div class="stat-box teal"><div class="stat-num">${a.length}</div><div class="stat-label">Responden Alumni</div></div>
    <div class="stat-box gold"><div class="stat-num">${e.length}</div><div class="stat-label">Responden Atasan Langsung Alumni</div></div>
    <div class="stat-box green"><div class="stat-num">${s.length}</div><div class="stat-label">Responden Stakeholder</div></div>
    <div class="stat-box teal"><div class="stat-num">${pctKerja}<span class="stat-unit">%</span></div><div class="stat-label">Alumni Bekerja</div></div>
    <div class="stat-box purple"><div class="stat-num">${pctLt6}<span class="stat-unit">%</span></div><div class="stat-label">WT &lt; 6 Bulan</div></div>
    <div class="stat-box gold"><div class="stat-num">${avg7}</div><div class="stat-label">Rata-rata 7 Aspek LAM <span class="stat-unit">/ 4</span></div></div>
    <div class="stat-box green"><div class="stat-num">${avgSk}</div><div class="stat-label">Kepuasan Stakeholder <span class="stat-unit">/ 4</span></div></div>
  `;

  // Helper
  const countBy = (arr, key) => {
    const m = {};
    arr.forEach(x => { const v = x[key]||'N/A'; m[v]=(m[v]||0)+1; });
    return m;
  };

  // Chart: Status pekerjaan
  if (a.length) {
    const sMap = countBy(a, 'status');
    _statCharts.status = new Chart(document.getElementById('sc-status'), {
      type: 'doughnut',
      data: { labels: Object.keys(sMap), datasets: [{ data: Object.values(sMap), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } } } }
    });

    // Chart: Waktu tunggu
    const tMap = countBy(a, 'tunggu');
    _statCharts.tunggu = new Chart(document.getElementById('sc-tunggu'), {
      type: 'doughnut',
      data: { labels: Object.keys(tMap), datasets: [{ data: Object.values(tMap), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } } } }
    });

    // Chart: Kesesuaian
    const kMap = countBy(a, 'kesesuaian');
    _statCharts.sesuai = new Chart(document.getElementById('sc-sesuai'), {
      type: 'doughnut',
      data: { labels: Object.keys(kMap), datasets: [{ data: Object.values(kMap), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } } } }
    });

    // Chart: Bidang kerja top 6
    const bMap = countBy(a, 'bidang');
    const bSorted = Object.entries(bMap).sort((x,y) => y[1]-x[1]).slice(0,6);
    _statCharts.bidang = new Chart(document.getElementById('sc-bidang'), {
      type: 'bar',
      data: {
        labels: bSorted.map(([k]) => k.split('(')[0].trim().substring(0,22)),
        datasets: [{ data: bSorted.map(([,v]) => v), backgroundColor: CHART_COLORS[0], borderRadius: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } }, y: { ticks: { font: { size: 10 } } } }
      }
    });
  } else {
    ['sc-status','sc-tunggu','sc-sesuai','sc-bidang'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.closest('.stat-chart-box').innerHTML += '<p style="text-align:center;color:var(--g500);font-size:12px;padding:20px">Belum ada data.</p>';
    });
  }

  // 7 Aspek bars
  const aspLabels = ['Integritas','Profesionalisme','Bahasa Asing','TI','Komunikasi','Kerja Tim','Pengembangan Diri'];
  const asp7html = e.length ? aspLabels.map((lbl, i) => {
    const k = `rtg_er${i+1}`;
    const vals = e.map(x => x[k]).filter(Boolean);
    const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
    const pct = (avg/5)*100;
    return `<div class="stat-bar-row">
      <div class="stat-bar-label">${lbl}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:var(--navy)"></div></div>
      <div class="stat-bar-val">${avg.toFixed(2)}</div>
    </div>`;
  }).join('') : '<p style="color:var(--g500);font-size:12px">Belum ada data pengguna lulusan.</p>';
  document.getElementById('stat-7asp-bars').innerHTML = asp7html;

  // Tingkat Tempat Kerja bars
  const lvlData = [
    { lbl: 'Lokal / Wilayah / Wirausaha', count: a.filter(x=>x.level_kerja&&x.level_kerja.toLowerCase().includes('lokal')).length },
    { lbl: 'Nasional / Berbadan Hukum', count: a.filter(x=>x.level_kerja&&x.level_kerja.toLowerCase().includes('nasional')).length },
    { lbl: 'Multinasional / Internasional', count: a.filter(x=>x.level_kerja&&(x.level_kerja.toLowerCase().includes('multi')||x.level_kerja.toLowerCase().includes('internasional'))).length },
  ];
  const totalLvl = lvlData.reduce((s,x)=>s+x.count,0)||1;
  document.getElementById('stat-level-bars').innerHTML = a.length ? lvlData.map(x => `
    <div class="stat-bar-row">
      <div class="stat-bar-label">${x.lbl}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round(x.count/totalLvl*100)}%;background:var(--teal)"></div></div>
      <div class="stat-bar-val">${x.count}</div>
    </div>`).join('') : '<p style="color:var(--g500);font-size:12px">Belum ada data alumni.</p>';

  // Kepuasan Stakeholder — 7 Aspek (Tabel 2.7C)
  const skAspLabels = ['Pengajaran','Kurikulum','Fasilitas','Pelayanan','SDM','Suasana','Kerjasama'];
  const skEl = document.getElementById('stat-sk-bars');
  if (skEl) {
    skEl.innerHTML = s.length ? skAspLabels.map((lbl, i) => {
      const k = `rtg_sk${i+1}`;
      const vals = s.map(x => x[k]).filter(Boolean);
      const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
      const pct = (avg/4)*100;
      return `<div class="stat-bar-row">
        <div class="stat-bar-label">${lbl}</div>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:var(--green)"></div></div>
        <div class="stat-bar-val">${avg.toFixed(2)}</div>
      </div>`;
    }).join('') : '<p style="color:var(--g500);font-size:12px">Belum ada data stakeholder.</p>';
  }

  // Distribusi jenis stakeholder
  if (s.length) {
    const skJenis = {};
    s.forEach(x => { const v = x.jenis||'N/A'; skJenis[v]=(skJenis[v]||0)+1; });
    const skCanvas = document.getElementById('sc-sk-jenis');
    if (skCanvas) {
      _statCharts.skJenis = new Chart(skCanvas, {
        type: 'doughnut',
        data: { labels: Object.keys(skJenis), datasets: [{ data: Object.values(skJenis), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } } } }
      });
    }
  } else {
    const skCanvas = document.getElementById('sc-sk-jenis');
    if (skCanvas) skCanvas.closest('.stat-chart-box').innerHTML += '<p style="text-align:center;color:var(--g500);font-size:12px;padding:20px">Belum ada data.</p>';
  }

  document.getElementById('stat-lastupdate').textContent =
    'Terakhir diperbarui: ' + new Date().toLocaleString('id-ID');

  document.getElementById('stat-loading-state').style.display = 'none';
  document.getElementById('stat-content').style.display = 'block';
}


// ══════════════════════════════════════════════════════════
//  DAFTAR RESPONDEN PUBLIK
// ══════════════════════════════════════════════════════════
export async function loadResponden() {
  document.getElementById('resp-loading').style.display = 'block';
  document.getElementById('resp-content').style.display = 'none';

  const [{ data: al }, { data: em }, { data: sk }] = await Promise.all([
    db.from(TBL_ALUMNI).select('nama,lulus,instansi').order('created_at', { ascending: false }),
    db.from(TBL_EMPLOYER).select('pengisi,instansi,jab_pengisi').order('created_at', { ascending: false }),
    db.from(TBL_STAKEHOLDER).select('nama,jenis,instansi').order('created_at', { ascending: false }),
  ]);

  const a = al || [], e = em || [], s = sk || [];
  const total = a.length + e.length + s.length;

  // Counters
  document.getElementById('rc-alumni').textContent     = a.length;
  document.getElementById('rc-employer').textContent   = e.length;
  document.getElementById('rc-stakeholder').textContent= s.length;
  document.getElementById('rc-total').textContent      = total;
  document.getElementById('resp-al-count').textContent = a.length + ' responden';
  document.getElementById('resp-em-count').textContent = e.length + ' responden';
  document.getElementById('resp-sk-count').textContent = s.length + ' responden';

  // Helper: inisial untuk avatar
  const initials = str => (str || '?').trim().split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('');

  // Render alumni
  const alEl = document.getElementById('resp-list-al');
  alEl.innerHTML = a.length ? a.map(r => `
    <div class="resp-item">
      <div class="ri-avatar teal">${initials(r.nama)}</div>
      <div class="ri-info">
        <div class="ri-name">${r.nama || '–'}</div>
        <div class="ri-sub">Lulus ${r.lulus || '–'}${r.instansi ? ' · ' + r.instansi : ''}</div>
      </div>
      <span class="ri-tag teal">Alumni</span>
    </div>`).join('') : '<div class="resp-empty">Belum ada responden alumni.</div>';

  // Render employer
  const emEl = document.getElementById('resp-list-em');
  emEl.innerHTML = e.length ? e.map(r => `
    <div class="resp-item">
      <div class="ri-avatar gold">${initials(r.pengisi)}</div>
      <div class="ri-info">
        <div class="ri-name">${r.pengisi || '–'}</div>
        <div class="ri-sub">${r.jab_pengisi || ''}${r.instansi ? ' · ' + r.instansi : ''}</div>
      </div>
      <span class="ri-tag gold">Instansi</span>
    </div>`).join('') : '<div class="resp-empty">Belum ada responden instansi.</div>';

  // Render stakeholder
  const skEl = document.getElementById('resp-list-sk');
  skEl.innerHTML = s.length ? s.map(r => `
    <div class="resp-item">
      <div class="ri-avatar green">${initials(r.nama)}</div>
      <div class="ri-info">
        <div class="ri-name">${r.nama || '–'}</div>
        <div class="ri-sub">${r.jenis || ''}${r.instansi ? ' · ' + r.instansi : ''}</div>
      </div>
      <span class="ri-tag green">Stakeholder</span>
    </div>`).join('') : '<div class="resp-empty">Belum ada responden stakeholder.</div>';

  document.getElementById('resp-loading').style.display = 'none';
  document.getElementById('resp-content').style.display = 'block';
}

// ══════════════════════════════════════════════════════════
//  EXPOSE ke HTML
// ══════════════════════════════════════════════════════════
window.goHome      = () => router.goHome();
window.startForm   = (r) => router.startForm(r);
window.showAdmin   = () => router.showAdmin();
window.showTentang = () => router.go('tentang');
window.showStatistik = async () => { router.go('statistik'); await loadStatistik(); };
window.showResponden  = async () => { router.go('responden'); await loadResponden(); };
window.loadResponden  = loadResponden;
window.loadStatistik = loadStatistik;
window.admLogin    = admLogin;
window.admLogout   = admLogout;
window._admTab     = admTab;
window._addAdmin   = addAdmin;
window._generateAI = generateAINarasi;
window._exportCSV  = exportCSV;
window._exportExcel= exportExcel;
window._printLaporan = printLaporan;

// ══════════════════════════════════════════════════════════
//  BOOTSTRAP
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initFormListeners();
  router.go('landing');
  console.log('[app.js] Tracer Study MSP FPIK UNSRAT — LAM PTIP IAPS 1.0');
});
