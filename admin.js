// ══════════════════════════════════════════════════════════
//  admin.js — Dashboard Admin
//  Superadmin : semua tab (Ringkasan, LAM, Analisis, Data Alumni,
//               Data Pengguna Lulusan, Kelola Admin)
//  Admin      : HANYA tab Analisis & Pembahasan
// ══════════════════════════════════════════════════════════

import { db }       from './db.js';
import { TBL_ALUMNI, TBL_EMPLOYER, TBL_ADMINS, TBL_STAKEHOLDER,
         ASPEK_LAM, ASPEK_PRODI, CHART_COLORS,
         TAB_ACCESS, ROLE, TAHUN_SURVEI } from './config.js';
import { getUser, isSuperAdmin } from './auth.js';
import { ASPEK_KEPUASAN } from './stakeholder.js';

// ── Chart instances (untuk destroy saat re-render)
const charts = {};

// ════════════════════════════════════════════════════════
//  TAB NAVIGATION — dengan penegakan role
// ════════════════════════════════════════════════════════
export function admTab(tabId) {
  const user    = getUser();
  const allowed = TAB_ACCESS[user?.role] || [];

  if (!allowed.includes(tabId)) {
    console.warn(`[auth] Role "${user?.role}" tidak boleh akses tab "${tabId}"`);
    tabId = allowed[0] || 'analisis';
  }

  document.querySelectorAll('.adm-tab').forEach(btn => {
    btn.classList.toggle('a', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.ap').forEach(p => p.classList.remove('a'));
  const panel = document.getElementById(`ap-${tabId}`);
  if (panel) panel.classList.add('a');

  switch (tabId) {
    case 'ov':       return renderOverview();
    case 'lam':      return renderLAM();
    case 'analisis': return renderAnalisis();
    case 'al':       return renderTableAlumni();
    case 'em':       return renderTableEmployer();
    case 'sk':       return renderTableStakeholder();
    case 'usr':      return isSuperAdmin() ? loadAdmins() : null;
  }
}

window._admTab = admTab;

// ════════════════════════════════════════════════════════
//  DATA FETCHER (shared cache per session)
// ════════════════════════════════════════════════════════
let _cache = { al: null, em: null, sk: null, ts: null };

async function getData() {
  if (_cache.al && _cache.em) return _cache;
  const [{ data: al }, { data: em }, { data: sk }] = await Promise.all([
    db.from(TBL_ALUMNI).select('*').order('created_at', { ascending: false }),
    db.from(TBL_EMPLOYER).select('*').order('created_at', { ascending: false }),
    db.from(TBL_STAKEHOLDER).select('*').order('created_at', { ascending: false }),
  ]);
  _cache = { al: al || [], em: em || [], sk: sk || [], ts: Date.now() };
  return _cache;
}

export function clearCache() { _cache = { al: null, em: null, sk: null, ts: null }; }

// ════════════════════════════════════════════════════════
//  RINGKASAN (Superadmin only)
// ════════════════════════════════════════════════════════
async function renderOverview() {
  const { al, em, sk } = await getData();
  const bekerja    = al.filter(a => a.status && !a.status.includes('Belum') && !a.status.includes('Studi')).length;
  const pctKerja   = al.length ? Math.round(bekerja / al.length * 100) : 0;
  const relevan    = al.filter(a => ['Sangat Erat','Erat'].includes(a.kesesuaian)).length;
  const pctRelevan = bekerja ? Math.round(relevan / bekerja * 100) : 0;
  const avg7       = avgRtg(em, ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
  const avgProdi   = avgRtg(al, ['rtg_ar1','rtg_ar2','rtg_ar3','rtg_ar4','rtg_ar5','rtg_ar6','rtg_ar7']);

  // Rata-rata kepuasan stakeholder
  const avgSk = avgRtg(sk, ['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7']);

  document.getElementById('sgrid').innerHTML = `
    <div class="sc"><div class="sl">Respons Alumni</div><div class="sv">${al.length}</div></div>
    <div class="sc"><div class="sl">Respons Atasan Langsung Alumni</div><div class="sv">${em.length}</div></div>
    <div class="sc"><div class="sl">Respons Stakeholder</div><div class="sv">${sk.length}</div></div>
    <div class="sc"><div class="sl">% Lulusan Bekerja</div><div class="sv">${pctKerja}<span class="su">%</span></div></div>
    <div class="sc"><div class="sl">% Kerja Relevan</div><div class="sv">${pctRelevan}<span class="su">%</span></div></div>
    <div class="sc"><div class="sl">Rata-rata 7 Aspek LAM</div><div class="sv">${avg7}<span class="su">/4</span></div></div>
    <div class="sc"><div class="sl">Rata-rata Penilaian Prodi</div><div class="sv">${avgProdi}<span class="su">/4</span></div></div>
    <div class="sc"><div class="sl">Kepuasan Stakeholder</div><div class="sv">${avgSk}<span class="su">/4</span></div></div>`;

  if (al.length) {
    mkChart('ch-status', 'doughnut', countBy(al,'status'));
    const bidangMap = countBy(al,'bidang');
    const bKeys     = Object.keys(bidangMap).map(k => k.split('(')[0].trim().substring(0,22));
    mkChart('ch-bidang', 'bar', Object.fromEntries(bKeys.map((k,i) => [k, Object.values(bidangMap)[i]])));
    mkChart('ch-tunggu', 'doughnut', countBy(al,'tunggu'));
    mkChart('ch-sesuai', 'doughnut', countBy(al,'kesesuaian'));
    const ks  = ASPEK_PRODI.map(r => r.id.replace('ar','rtg_ar'));
    const rav = ks.map(k => avgOf(al, k));
    mkHBar('ch-rtg', ASPEK_PRODI.map(r => r.lbl.substring(0,32)), rav, '#006D77');
  }
  if (em.length) {
    mkChart('ch-puas', 'doughnut', countBy(em,'kepuasan'));
    const eks = ASPEK_LAM.map(r => r.id.replace('er','rtg_er'));
    const e7v = eks.map(k => avgOf(em, k));
    mkHBar('ch-7asp', ASPEK_LAM.map(r => r.lbl.substring(0,32)), e7v, '#003D5B');
  }

  // Stakeholder charts
  if (sk.length) {
    mkChart('ch-sk-jenis', 'doughnut', countBy(sk,'jenis'));
    const skKeys = ASPEK_KEPUASAN.map(r => `rtg_${r.id}`);
    const skVals = skKeys.map(k => avgOf(sk, k));
    mkHBar('ch-sk-asp', ASPEK_KEPUASAN.map(r => r.lbl.substring(0,32)), skVals, '#1B7A4A');
  }
}

// ════════════════════════════════════════════════════════
//  LAPORAN LAM PTIP
// ════════════════════════════════════════════════════════
async function renderLAM() {
  const { al, em } = await getData();
  const div        = document.getElementById('lam-report');
  if (!al.length && !em.length) { div.innerHTML = '<div class="empty">Belum ada data.</div>'; return; }

  const t27b = ASPEK_LAM.map((r, i) => {
    const k   = `rtg_er${i+1}`;
    const vs  = em.map(e => e[k]).filter(Boolean);
    const avg = vs.length ? (vs.reduce((a,b) => a+b,0)/vs.length).toFixed(2) : '-';
    const cnt = { 4:0, 3:0, 2:0, 1:0 };
    vs.forEach(v => { const cat = v>=4?4:v>=3?3:v>=2?2:1; cnt[cat]++; });
    return `<tr><td>${i+1}</td><td>${r.lbl}</td>
      <td>${cnt[4]}</td><td>${cnt[3]}</td><td>${cnt[2]}</td><td>${cnt[1]}</td>
      <td><strong>${avg}</strong></td></tr>`;
  }).join('');

  const tungguCat = {
    'lt6' : al.filter(a => a.tunggu && (a.tunggu.includes('< 6') || a.tunggu.includes('Kurang dari 6'))).length,
    '6_18': al.filter(a => a.tunggu && (a.tunggu.includes('6') && !a.tunggu.includes('< 6') || a.tunggu.includes('6 –'))).length,
    'gt18': al.filter(a => a.tunggu && a.tunggu.includes('> 18')).length,
  };
  const totalT = tungguCat.lt6 + tungguCat['6_18'] + tungguCat.gt18 || 1;
  const pctLt6 = Math.round(tungguCat.lt6 / totalT * 100);

  const levelCat = {
    lokal       : al.filter(a => a.level_kerja && a.level_kerja.toLowerCase().includes('lokal')).length,
    nasional    : al.filter(a => a.level_kerja && a.level_kerja.toLowerCase().includes('nasional')).length,
    multinasional: al.filter(a => a.level_kerja && (a.level_kerja.toLowerCase().includes('multinasional')||a.level_kerja.toLowerCase().includes('internasional'))).length,
  };

  div.innerHTML = `
  <div class="info-box lam" style="margin-bottom:20px">
    <strong>📊 Tabel 2.7B — Kepuasan Pengguna Lulusan (${em.length} responden)</strong>
  </div>
  <div class="tw" style="margin-bottom:24px">
    <table class="dt">
      <thead><tr><th>No</th><th>Aspek Kompetensi</th><th>Sangat Baik (4)</th><th>Baik (3)</th><th>Cukup (2)</th><th>Kurang (1)</th><th>Rata-rata</th></tr></thead>
      <tbody>${t27b}</tbody>
    </table>
  </div>
  <div class="info-box lam" style="margin-bottom:16px">
    <strong>📊 Tabel 2.8B1 — Waktu Tunggu Lulusan (${al.length} responden)</strong>
  </div>
  <div class="tw" style="margin-bottom:24px">
    <table class="dt">
      <thead><tr><th>Kategori Waktu Tunggu</th><th>Jumlah Lulusan</th><th>Persentase</th></tr></thead>
      <tbody>
        <tr><td>WT &lt; 6 bulan</td><td>${tungguCat.lt6}</td><td>${Math.round(tungguCat.lt6/totalT*100)}%</td></tr>
        <tr><td>6 ≤ WT ≤ 18 bulan</td><td>${tungguCat['6_18']}</td><td>${Math.round(tungguCat['6_18']/totalT*100)}%</td></tr>
        <tr><td>WT &gt; 18 bulan</td><td>${tungguCat.gt18}</td><td>${Math.round(tungguCat.gt18/totalT*100)}%</td></tr>
      </tbody>
    </table>
  </div>
  <div class="info-box lam" style="margin-bottom:16px">
    <strong>WT1 (% lulusan dengan WT &lt; 6 bln) = ${pctLt6}%</strong>
  </div>
  <div class="info-box lam" style="margin-bottom:16px">
    <strong>📊 Tabel 2.8B2 — Tempat Kerja / Berwirausaha (${al.length} responden)</strong>
  </div>
  <div class="tw">
    <table class="dt">
      <thead><tr><th>Tingkat Tempat Kerja</th><th>Jumlah</th><th>Persentase</th></tr></thead>
      <tbody>
        <tr><td>Lokal / Wilayah / Wirausaha tidak berizin</td><td>${levelCat.lokal}</td><td>${Math.round(levelCat.lokal/al.length*100||0)}%</td></tr>
        <tr><td>Nasional / Berbadan Hukum</td><td>${levelCat.nasional}</td><td>${Math.round(levelCat.nasional/al.length*100||0)}%</td></tr>
        <tr><td>Multinasional / Internasional</td><td>${levelCat.multinasional}</td><td>${Math.round(levelCat.multinasional/al.length*100||0)}%</td></tr>
      </tbody>
    </table>
  </div>
  <div class="info-box lam" style="margin-bottom:16px">
    <strong>📊 Tabel 2.7C — Kepuasan Stakeholder Internal & Eksternal (${_cache.sk?.length||0} responden)</strong>
  </div>
  <div class="tw">
    ${render27CTable(_cache.sk||[])}
  </div>`;
}

// ════════════════════════════════════════════════════════
//  ANALISIS & PEMBAHASAN
// ════════════════════════════════════════════════════════
async function renderAnalisis() {
  const { al, em, sk } = await getData();
  document.getElementById('cover-date').textContent =
    'Dicetak: ' + new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});

  const bekerja  = al.filter(a => a.status && !a.status.includes('Belum') && !a.status.includes('Studi')).length;
  const pctKerja = al.length ? Math.round(bekerja/al.length*100) : 0;
  document.getElementById('sec-profil').innerHTML = `
    <div class="sg" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="sc"><div class="sl">Total Alumni</div><div class="sv">${al.length}</div></div>
      <div class="sc"><div class="sl">Total Instansi</div><div class="sv">${em.length}</div></div>
      <div class="sc"><div class="sl">% Bekerja</div><div class="sv">${pctKerja}<span class="su">%</span></div></div>
    </div>`;

  renderLAM27B(em);
  renderLAM27C(sk);
  renderLAM28B1(al);
  renderLAM28B2(al);
  renderRTL(al, em);
}

function renderLAM27B(em) {
  const el = document.getElementById('sec-27b');
  if (!em.length) { el.innerHTML = '<div class="empty">Belum ada data pengguna lulusan.</div>'; return; }
  const rows = ASPEK_LAM.map((r,i) => {
    const k  = `rtg_er${i+1}`;
    const vs = em.map(e=>e[k]).filter(Boolean);
    const avg= vs.length?(vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2):'-';
    return `<tr><td>${i+1}</td><td>${r.lbl}</td><td>${avg}</td></tr>`;
  }).join('');
  el.innerHTML = `<div class="tw"><table class="dt">
    <thead><tr><th>No</th><th>Aspek Kompetensi</th><th>Rata-rata</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderLAM27C(sk) {
  const el = document.getElementById('sec-27c');
  if (!el) return;
  if (!sk || !sk.length) { el.innerHTML = '<div class="empty">Belum ada data kepuasan stakeholder.</div>'; return; }
  el.innerHTML = `<div class="tw">${render27CTable(sk)}</div>`;
}

function renderLAM28B1(al) {
  const el = document.getElementById('sec-28b1');
  if (!al.length) { el.innerHTML = '<div class="empty">Belum ada data alumni.</div>'; return; }
  const lt6  = al.filter(a=>a.tunggu&&(a.tunggu.includes('<')||a.tunggu.includes('Kurang dari 6'))).length;
  const mid  = al.filter(a=>a.tunggu&&a.tunggu.includes('6 –')).length;
  const gt18 = al.filter(a=>a.tunggu&&a.tunggu.includes('> 18')).length;
  const tot  = lt6+mid+gt18||1;
  el.innerHTML = `<div class="tw"><table class="dt">
    <thead><tr><th>Kategori</th><th>Jumlah</th><th>%</th></tr></thead>
    <tbody>
      <tr><td>WT &lt; 6 bulan</td><td>${lt6}</td><td>${Math.round(lt6/tot*100)}%</td></tr>
      <tr><td>6 ≤ WT ≤ 18 bulan</td><td>${mid}</td><td>${Math.round(mid/tot*100)}%</td></tr>
      <tr><td>WT &gt; 18 bulan</td><td>${gt18}</td><td>${Math.round(gt18/tot*100)}%</td></tr>
    </tbody></table></div>`;
}

function renderLAM28B2(al) {
  const el  = document.getElementById('sec-28b2');
  if (!al.length) { el.innerHTML = '<div class="empty">Belum ada data alumni.</div>'; return; }
  const lok = al.filter(a=>a.level_kerja&&a.level_kerja.toLowerCase().includes('lokal')).length;
  const nas = al.filter(a=>a.level_kerja&&a.level_kerja.toLowerCase().includes('nasional')).length;
  const mul = al.filter(a=>a.level_kerja&&(a.level_kerja.toLowerCase().includes('multinasional')||a.level_kerja.toLowerCase().includes('internasional'))).length;
  const tot = al.length||1;
  el.innerHTML = `<div class="tw"><table class="dt">
    <thead><tr><th>Tingkat</th><th>Jumlah</th><th>%</th></tr></thead>
    <tbody>
      <tr><td>Lokal/Wilayah/Wirausaha</td><td>${lok}</td><td>${Math.round(lok/tot*100)}%</td></tr>
      <tr><td>Nasional/Berbadan Hukum</td><td>${nas}</td><td>${Math.round(nas/tot*100)}%</td></tr>
      <tr><td>Multinasional/Internasional</td><td>${mul}</td><td>${Math.round(mul/tot*100)}%</td></tr>
    </tbody></table></div>`;
}

function renderRTL(al, em) {
  const avg7   = avgRtg(em, ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
  const lt6Pct = al.length ? Math.round(al.filter(a=>a.tunggu&&(a.tunggu.includes('<')||a.tunggu.includes('Kurang dari 6'))).length/al.length*100) : 0;
  document.getElementById('tb-rtl').innerHTML = `
    <tr><td>1</td><td>Kepuasan Pengguna Lulusan</td><td>Rata-rata 7 aspek: ${avg7}/5</td>
        <td>Peningkatan kompetensi bahasa asing & TIK melalui kurikulum</td><td>1 tahun</td><td>Kaprodi</td></tr>
    <tr><td>2</td><td>Waktu Tunggu Kerja</td><td>WT &lt; 6 bln: ${lt6Pct}% alumni</td>
        <td>Perkuat program magang & career fair dengan instansi mitra</td><td>6 bulan</td><td>Kaprodi</td></tr>
    <tr><td>3</td><td>Kesesuaian Bidang Kerja</td><td>Data dari ${al.length} responden</td>
        <td>Penguatan link & match kurikulum dengan kebutuhan industri</td><td>1 tahun</td><td>Kaprodi</td></tr>`;
}

// ════════════════════════════════════════════════════════
//  DATA TABEL
// ════════════════════════════════════════════════════════
async function renderTableAlumni() {
  const { al } = await getData();
  document.getElementById('tb-al').innerHTML = al.length
    ? al.map(a => `<tr>
        <td><strong>${a.nama}</strong></td><td>${a.nim}</td><td>${a.lulus||'–'}</td>
        <td>${a.email}</td><td><span class="bdg bgt">${a.status||'–'}</span></td>
        <td>${a.instansi||'–'}</td><td>${(a.bidang||'–').split('(')[0].trim()}</td>
        <td>${a.level_kerja||'–'}</td><td><span class="bdg bgb">${a.tunggu||'–'}</span></td>
        <td><span class="bdg bgo">${a.kesesuaian||'–'}</span></td>
        <td>${a.gaji||'–'}</td><td>${a.rekomendasi||'–'}</td>
        <td style="font-size:10.5px;white-space:nowrap">${new Date(a.created_at).toLocaleString('id-ID')}</td>
        <td class="delete-only-superadmin">
          <button onclick="window._deleteRow('${TBL_ALUMNI}','${a.id}')"
            style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--red);color:var(--red);background:#fff;cursor:pointer">
            Hapus
          </button>
        </td></tr>`).join('')
    : '<tr><td colspan="14"><div class="empty">Belum ada data alumni.</div></td></tr>';
}

async function renderTableEmployer() {
  const { em } = await getData();
  document.getElementById('tb-em').innerHTML = em.length
    ? em.map(e => `<tr>
        <td><strong>${e.instansi}</strong></td><td>${e.sektor}</td>
        <td>${e.kota}</td><td>${e.pengisi}</td><td>${e.email}</td>
        <td>${e.alumni_nama||'–'}</td>
        <td><span class="bdg bgg">${e.kepuasan||'–'}</span></td>
        <td>${e.rekrut||'–'}</td>
        <td style="font-size:10.5px;white-space:nowrap">${new Date(e.created_at).toLocaleString('id-ID')}</td>
        <td class="delete-only-superadmin">
          <button onclick="window._deleteRow('${TBL_EMPLOYER}','${e.id}')"
            style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--red);color:var(--red);background:#fff;cursor:pointer">
            Hapus
          </button>
        </td></tr>`).join('')
    : '<tr><td colspan="10"><div class="empty">Belum ada data pengguna lulusan.</div></td></tr>';
}

// ════════════════════════════════════════════════════════
//  TABEL 2.7C — KEPUASAN STAKEHOLDER (Format LAM PTIP Lengkap)
// ════════════════════════════════════════════════════════

const SK_CONFIG_KEY = 'sk_27c_config';

function getSkConfig() {
  try { return JSON.parse(localStorage.getItem(SK_CONFIG_KEY) || '{}'); } catch { return {}; }
}
function saveSkConfig(cfg) {
  localStorage.setItem(SK_CONFIG_KEY, JSON.stringify(cfg));
}

const JENIS_LIST = ['Mahasiswa','Dosen','Tenaga Kependidikan','Mitra','Lulusan','Pengguna Lulusan','Lainnya'];
const TAHUN = { TS: TAHUN_SURVEI.TS, TS1: TAHUN_SURVEI.TS_1, TS2: TAHUN_SURVEI.TS_2 };

function render27CTable(sk) {
  const cfg = getSkConfig();

  const headerRow = `
    <thead>
      <tr style="background:var(--navy);color:#fff;font-size:11px">
        <th rowspan="3" style="text-align:center;vertical-align:middle;width:30px">No</th>
        <th rowspan="3" style="text-align:center;vertical-align:middle;min-width:110px">Stakeholder</th>
        <th colspan="2" style="text-align:center">Instrumen</th>
        <th colspan="3" style="text-align:center">Jumlah Responden</th>
        <th colspan="3" style="text-align:center">% Keterwakilan Responden</th>
        <th colspan="4" style="text-align:center">Jml Responden Menjawab (SB=4, B=3, C=2, K=1)</th>
        <th rowspan="3" style="text-align:center;vertical-align:middle;min-width:60px">Skor</th>
        <th rowspan="3" style="text-align:center;vertical-align:middle;min-width:120px">Tindak Lanjut</th>
      </tr>
      <tr style="background:var(--navy-md);color:#fff;font-size:10px">
        <th style="text-align:center">Ada</th>
        <th style="text-align:center">Tidak Ada</th>
        <th style="text-align:center">TS-2<br>(${TAHUN.TS2})</th>
        <th style="text-align:center">TS-1<br>(${TAHUN.TS1})</th>
        <th style="text-align:center">TS<br>(${TAHUN.TS})</th>
        <th style="text-align:center">TS-2<br>(${TAHUN.TS2})</th>
        <th style="text-align:center">TS-1<br>(${TAHUN.TS1})</th>
        <th style="text-align:center">TS<br>(${TAHUN.TS})</th>
        <th style="text-align:center">SB</th>
        <th style="text-align:center">B</th>
        <th style="text-align:center">C</th>
        <th style="text-align:center">KB</th>
      </tr>
      <tr style="background:var(--g100);font-size:10px;color:var(--g600)">
        <th style="text-align:center">(3)</th><th style="text-align:center">(4)</th>
        <th style="text-align:center">(5)</th><th style="text-align:center">(6)</th><th style="text-align:center">(7)</th>
        <th style="text-align:center">(8)</th><th style="text-align:center">(9)</th><th style="text-align:center">(10)</th>
        <th style="text-align:center">(11)</th><th style="text-align:center">(12)</th>
        <th style="text-align:center">(13)</th><th style="text-align:center">(14)</th>
      </tr>
    </thead>`;

  const rows = JENIS_LIST.map((j, idx) => {
    const no    = idx < 6 ? idx + 1 : '...';
    const jKey  = j.replace(/\s+/g,'_');
    const c     = cfg[jKey] || {};

    const rTS2  = sk.filter(x => x.jenis === j && x.tahun_survei === TAHUN.TS2).length;
    const rTS1  = sk.filter(x => x.jenis === j && x.tahun_survei === TAHUN.TS1).length;
    const rTS   = sk.filter(x => x.jenis === j && x.tahun_survei === TAHUN.TS).length;

    const popTS2 = parseInt(c.popTS2 || 0);
    const popTS1 = parseInt(c.popTS1 || 0);
    const popTS  = parseInt(c.popTS  || 0);

    const pct = (r, p) => (p > 0 ? Math.round(r / p * 100) + '%' : '–');

    const grpTS = sk.filter(x => x.jenis === j && x.tahun_survei === TAHUN.TS);
    const keys  = ['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7'];
    const cnt   = { SB:0, B:0, C:0, K:0 };
    grpTS.forEach(x => {
      const vals = keys.map(k => x[k]).filter(Boolean);
      if (!vals.length) return;
      const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
      if (avg >= 3.5) cnt.SB++; else if (avg >= 2.5) cnt.B++;
      else if (avg >= 1.5) cnt.C++; else cnt.K++;
    });

    const allGrp = sk.filter(x => x.jenis === j);
    let skor = '–';
    if (allGrp.length) {
      const tot = allGrp.reduce((s, x) => {
        const vals = keys.map(k => x[k]).filter(Boolean);
        return s + (vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0);
      }, 0);
      skor = (tot / allGrp.length).toFixed(2);
    }
    const skorBadge = skor !== '–' ? (parseFloat(skor)>=3.5?'bgg':parseFloat(skor)>=2.5?'bgt':parseFloat(skor)>=1.5?'bgo':'') : '';

    const instrAda    = c.instrAda    === '1';
    const instrTidak  = c.instrAda    === '0';
    const tindakLanjut = c.tindak || '';

    return `<tr>
      <td style="text-align:center;font-weight:600">${no}</td>
      <td style="font-weight:500">${j}${j==='Lulusan'?'<span style="color:var(--g500);font-size:10px"> (*)</span>':''}</td>
      <td style="text-align:center">
        <select onchange="window._skCfgSave('${jKey}','instrAda',this.value)"
          style="font-size:11px;padding:2px 4px;border:1px solid var(--g200);border-radius:4px;width:60px">
          <option value="">–</option>
          <option value="1" ${instrAda?'selected':''}>✓ Ada</option>
          <option value="0" ${instrTidak?'selected':''}>✗ Tidak</option>
        </select>
      </td>
      <td style="text-align:center">
        <span style="font-size:12px">${instrTidak?'✓':'–'}</span>
      </td>
      <td style="text-align:center">
        <input type="number" min="0" value="${rTS2||''}"
          style="width:52px;font-size:11px;text-align:center;border:1px solid var(--g200);border-radius:4px;padding:2px"
          readonly title="Dihitung otomatis dari database (${rTS2} responden tahun ${TAHUN.TS2})">
      </td>
      <td style="text-align:center">
        <input type="number" min="0" value="${rTS1||''}"
          style="width:52px;font-size:11px;text-align:center;border:1px solid var(--g200);border-radius:4px;padding:2px"
          readonly title="Dihitung otomatis dari database (${rTS1} responden tahun ${TAHUN.TS1})">
      </td>
      <td style="text-align:center">
        <input type="number" min="0" value="${rTS||''}"
          style="width:52px;font-size:11px;text-align:center;border:1px solid var(--g200);border-radius:4px;padding:2px"
          readonly title="Dihitung otomatis dari database (${rTS} responden tahun ${TAHUN.TS})">
      </td>
      <td style="text-align:center">
        <span title="Populasi TS-2: ${popTS2 || 'belum diisi'}">${pct(rTS2, popTS2)}</span>
        ${isSuperAdmin()?`<br><input type="number" min="0" value="${popTS2||''}" placeholder="Pop."
          onchange="window._skCfgSave('${jKey}','popTS2',this.value)"
          style="width:52px;font-size:10px;margin-top:2px;border:1px dashed var(--g300);border-radius:4px;padding:1px;text-align:center"
          title="Isi jumlah total populasi ${j} tahun ${TAHUN.TS2}">` : ''}
      </td>
      <td style="text-align:center">
        <span>${pct(rTS1, popTS1)}</span>
        ${isSuperAdmin()?`<br><input type="number" min="0" value="${popTS1||''}" placeholder="Pop."
          onchange="window._skCfgSave('${jKey}','popTS1',this.value)"
          style="width:52px;font-size:10px;margin-top:2px;border:1px dashed var(--g300);border-radius:4px;padding:1px;text-align:center"
          title="Isi jumlah total populasi ${j} tahun ${TAHUN.TS1}">` : ''}
      </td>
      <td style="text-align:center">
        <span>${pct(rTS, popTS)}</span>
        ${isSuperAdmin()?`<br><input type="number" min="0" value="${popTS||''}" placeholder="Pop."
          onchange="window._skCfgSave('${jKey}','popTS',this.value)"
          style="width:52px;font-size:10px;margin-top:2px;border:1px dashed var(--g300);border-radius:4px;padding:1px;text-align:center"
          title="Isi jumlah total populasi ${j} tahun ${TAHUN.TS}">` : ''}
      </td>
      <td style="text-align:center">${cnt.SB||'–'}</td>
      <td style="text-align:center">${cnt.B||'–'}</td>
      <td style="text-align:center">${cnt.C||'–'}</td>
      <td style="text-align:center">${cnt.K||'–'}</td>
      <td style="text-align:center"><span class="bdg ${skorBadge}">${skor}</span></td>
      <td>
        ${isSuperAdmin()?`<textarea onchange="window._skCfgSave('${jKey}','tindak',this.value)"
          style="width:100%;font-size:11px;border:1px dashed var(--g300);border-radius:4px;padding:4px;resize:vertical;min-height:48px"
          placeholder="Isi tindak lanjut...">${tindakLanjut}</textarea>` :
          `<span style="font-size:11px;color:var(--g600)">${tindakLanjut||'–'}</span>`}
      </td>
    </tr>`;
  }).join('');

  const keterangan = `<p style="font-size:11px;color:var(--g500);margin-top:10px;font-style:italic">
    <strong>Keterangan:</strong> Skala penilaian responden: SB (Sangat Baik) = 4, B (Baik) = 3, C (Cukup) = 2, K (Kurang) = 1.
    Skor akhir dikonversi ke skala 1–4 sesuai panduan LAM PTIP IAPS 1.0.<br>
    ${isSuperAdmin()?'<span style="color:var(--teal)">💡 <strong>Superadmin:</strong> Isi kolom populasi (input kecil di bawah %) dan tindak lanjut. Data tersimpan otomatis di browser.</span>':''}
  </p>`;

  return `<div class="tw" style="overflow-x:auto">
    <table class="dt" style="min-width:900px;font-size:12px">
      ${headerRow}
      <tbody>${rows}</tbody>
    </table>
    ${keterangan}
  </div>`;
}

window._skCfgSave = function(jKey, field, value) {
  const cfg = getSkConfig();
  if (!cfg[jKey]) cfg[jKey] = {};
  cfg[jKey][field] = value;
  saveSkConfig(cfg);
};

async function renderTableStakeholder() {
  const { sk } = await getData();
  const el = document.getElementById('tb-sk');
  if (!el) return;

  el.innerHTML = sk.length
    ? sk.map(s => {
        const th = s.tahun_survei;
        const tsLabel = th === TAHUN_SURVEI.TS ? `TS (${th})` : th === TAHUN_SURVEI.TS_1 ? `TS-1 (${th})` : th === TAHUN_SURVEI.TS_2 ? `TS-2 (${th})` : th||'–';
        return `<tr>
        <td><span class="bdg bgt">${s.jenis||'–'}</span></td>
        <td><span class="bdg ${th===TAHUN_SURVEI.TS?'bgg':th===TAHUN_SURVEI.TS_1?'bgt':'bgo'}">${tsLabel}</span></td>
        <td><strong>${s.nama||'–'}</strong></td>
        <td>${s.instansi||'–'}</td>
        <td>${s.email||'–'}</td>
        <td style="text-align:center">${s.rtg_sk1||'–'}</td>
        <td style="text-align:center">${s.rtg_sk2||'–'}</td>
        <td style="text-align:center">${s.rtg_sk3||'–'}</td>
        <td style="text-align:center">${s.rtg_sk4||'–'}</td>
        <td style="text-align:center">${s.rtg_sk5||'–'}</td>
        <td style="text-align:center">${s.rtg_sk6||'–'}</td>
        <td style="text-align:center">${s.rtg_sk7||'–'}</td>
        <td><span class="bdg bgg">${s.kepuasan||'–'}</span></td>
        <td style="font-size:10.5px;white-space:nowrap">${new Date(s.created_at).toLocaleString('id-ID')}</td>
        <td class="delete-only-superadmin">
          <button onclick="window._deleteRow('${TBL_STAKEHOLDER}','${s.id}')"
            style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--red);color:var(--red);background:#fff;cursor:pointer">
            Hapus
          </button>
        </td></tr>`;
      }).join('')
    : '<tr><td colspan="15"><div class="empty">Belum ada data stakeholder.</div></td></tr>';
}

window._deleteRow = async function(table, id) {
  if (!isSuperAdmin()) return alert('Akses ditolak.');
  if (!confirm('Yakin hapus data ini?')) return;
  await db.from(table).delete().eq('id', id);
  clearCache();
  if (table === TBL_ALUMNI)       renderTableAlumni();
  else if (table === TBL_EMPLOYER) renderTableEmployer();
  else if (table === TBL_STAKEHOLDER) renderTableStakeholder();
};

// ════════════════════════════════════════════════════════
//  KELOLA ADMIN
// ════════════════════════════════════════════════════════
export async function loadAdmins() {
  if (!isSuperAdmin()) return;
  const { data, error } = await db.from(TBL_ADMINS).select('*').order('created_at');
  if (error) {
    document.getElementById('tb-admins').innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
    return;
  }
  document.getElementById('tb-admins').innerHTML = (data||[]).map(u => `<tr>
    <td><strong>${u.username}</strong></td>
    <td>${u.full_name||'–'}</td>
    <td><span class="bdg ${u.role===ROLE.SUPERADMIN?'bgb':'bgt'}">${u.role}</span></td>
    <td><span class="bdg ${u.is_active?'bgg':''}">${u.is_active?'Aktif':'Nonaktif'}</span></td>
    <td style="font-size:10.5px">${new Date(u.created_at).toLocaleDateString('id-ID')}</td>
    <td>${u.role!==ROLE.SUPERADMIN?`
      <button onclick="window._toggleAdmin(${u.id},${u.is_active})"
        style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--g200);background:#fff;cursor:pointer">
        ${u.is_active?'Nonaktifkan':'Aktifkan'}
      </button>
      <button onclick="window._deleteAdmin(${u.id})"
        style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--red);color:var(--red);background:#fff;cursor:pointer;margin-left:4px">
        Hapus
      </button>`:'–'}
    </td></tr>`).join('');
}

export async function addAdmin() {
  if (!isSuperAdmin()) return;
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value.trim();
  const nama     = document.getElementById('new-nama').value.trim();
  const role     = document.getElementById('new-role').value;
  const errBox   = document.getElementById('add-admin-err');
  errBox.style.display = 'none';
  if (!username||!password) {
    errBox.textContent='Username dan password wajib diisi.';
    errBox.style.display='block'; return;
  }
  const { error } = await db.from(TBL_ADMINS).insert({ username, password, full_name:nama, role, is_active:true });
  if (error) { errBox.textContent='Gagal: '+error.message; errBox.style.display='block'; return; }
  ['new-username','new-password','new-nama'].forEach(id=>document.getElementById(id).value='');
  loadAdmins();
}

window._toggleAdmin = async (id, isActive) => {
  if (!isSuperAdmin()) return;
  await db.from(TBL_ADMINS).update({ is_active:!isActive }).eq('id',id);
  loadAdmins();
};
window._deleteAdmin = async (id) => {
  if (!isSuperAdmin()) return;
  if (!confirm('Yakin hapus akun admin ini?')) return;
  await db.from(TBL_ADMINS).delete().eq('id',id);
  loadAdmins();
};
window._addAdmin = addAdmin;

// ════════════════════════════════════════════════════════
//  GENERATE NARASI AI — menggunakan Google Gemini API
// ════════════════════════════════════════════════════════
export async function generateAINarasi() {
  const { al, em, sk } = await getData();
  const btn  = document.getElementById('btn-ai');
  const txt  = document.getElementById('btn-ai-txt');
  const load = document.getElementById('narasi-loading');
  const cont = document.getElementById('narasi-content');

  btn.disabled = true; txt.textContent = '⏳ Menganalisis...';
  load.style.display = 'block';
  cont.innerHTML = '<p style="color:var(--g500);font-style:italic">Sedang membuat narasi, harap tunggu...</p>';

  // Hitung statistik untuk prompt
  const bekerja    = al.filter(a=>a.status&&!a.status.includes('Belum')&&!a.status.includes('Studi')).length;
  const pctKerja   = al.length ? Math.round(bekerja/al.length*100) : 0;
  const avg7       = avgRtg(em,['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
  const avgProdi   = avgRtg(al,['rtg_ar1','rtg_ar2','rtg_ar3','rtg_ar4','rtg_ar5','rtg_ar6','rtg_ar7']);
  const avgSk      = avgRtg(sk,['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7']);
  const lt6        = al.filter(a=>a.tunggu&&(a.tunggu.includes('<')||a.tunggu.includes('Kurang dari 6'))).length;
  const pctLt6     = al.length ? Math.round(lt6/al.length*100) : 0;
  const relevan    = al.filter(a=>['Sangat Erat','Erat'].includes(a.kesesuaian)).length;
  const pctRelevan = bekerja ? Math.round(relevan/bekerja*100) : 0;
  const top3bidang = Object.entries(countBy(al,'bidang')).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]).join(', ');
  const kepuasanEm = JSON.stringify(countBy(em,'kepuasan'));
  const jenisSkMap = JSON.stringify(countBy(sk,'jenis'));

  // Detail 7 aspek LAM (Tabel 2.7B)
  const detail7Aspek = ASPEK_LAM.map((r,i) => {
    const k  = `rtg_er${i+1}`;
    const vs = em.map(e=>e[k]).filter(Boolean);
    const avg= vs.length ? (vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2) : '-';
    return `  ${i+1}. ${r.lbl}: ${avg}/4`;
  }).join('\n');

  // Detail 7 aspek Prodi oleh Alumni
  const detailProdi = ASPEK_PRODI.map((r,i) => {
    const k  = `rtg_ar${i+1}`;
    const vs = al.map(a=>a[k]).filter(Boolean);
    const avg= vs.length ? (vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2) : '-';
    return `  ${i+1}. ${r.lbl}: ${avg}/4`;
  }).join('\n');

  const prompt = `Anda adalah analis akademik untuk akreditasi LAM PTIP IAPS 1.0.
Buatlah narasi pembahasan hasil tracer study Program Studi Manajemen Sumber Daya Perairan (MSP) Fakultas Perikanan dan Ilmu Kelautan Universitas Sam Ratulangi (FPIK UNSRAT) dalam bahasa Indonesia yang formal dan akademis (±600 kata).

DATA TRACER STUDY:
- Total responden alumni: ${al.length} orang
- Total responden pengguna lulusan (atasan langsung): ${em.length} instansi
- Total responden stakeholder: ${sk.length} orang (${jenisSkMap})
- Persentase lulusan yang bekerja/berwirausaha: ${pctKerja}%
- Persentase kesesuaian bidang kerja (Erat + Sangat Erat): ${pctRelevan}%
- Persentase lulusan dengan waktu tunggu < 6 bulan: ${pctLt6}%
- 3 bidang kerja terbanyak: ${top3bidang}
- Distribusi kepuasan pengguna lulusan: ${kepuasanEm}

TABEL 2.7B — Rata-rata Kepuasan Pengguna Lulusan (skala 1–4):
${detail7Aspek}
Rata-rata keseluruhan 7 aspek: ${avg7}/4

PENILAIAN ALUMNI TERHADAP PRODI (skala 1–4):
${detailProdi}
Rata-rata keseluruhan: ${avgProdi}/4

KEPUASAN STAKEHOLDER (Tabel 2.7C): Rata-rata ${avgSk}/4

Tulis narasi dengan struktur berikut (gunakan paragraf, bukan poin):
1. Pendahuluan — latar belakang tracer study MSP FPIK UNSRAT
2. Profil penyerapan dan waktu tunggu lulusan (Tabel 2.8B1 & 2.8B2)
3. Kepuasan pengguna lulusan — analisis 7 aspek LAM PTIP (Tabel 2.7B)
4. Penilaian alumni terhadap program studi
5. Kepuasan stakeholder (Tabel 2.7C)
6. Kesimpulan dan rekomendasi tindak lanjut untuk peningkatan mutu prodi`;

  // Cek API key
  if (!window.ANTHROPIC_API_KEY) {
    cont.innerHTML = `
      <div class="info-box err">
        <strong>⚠️ API Key belum diisi</strong><br>
        Masukkan <strong>Gemini API Key</strong> (AIzaSy...) pada kolom 🔑 di sebelah kiri tombol Generate.<br>
        <small style="color:var(--g500)">API key dapat dibuat di <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--teal)">aistudio.google.com/apikey</a></small>
      </div>`;
    load.style.display = 'none';
    btn.disabled = false;
    txt.textContent = '✨ Generate Narasi AI';
    return;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${window.ANTHROPIC_API_KEY}`,
      {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1500 }
        })
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(()=>({error:{message:res.statusText}}));
      throw new Error(errData?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
                 || 'Tidak ada respons dari AI.';

    // Render paragraf dengan format rapi
    cont.innerHTML = text
      .split('\n\n')
      .filter(p => p.trim())
      .map(p => {
        if (/^\*\*(.+)\*\*$/.test(p.trim())) {
          return `<h4 style="margin:16px 0 6px;color:var(--navy,#003D5B)">${p.trim().replace(/\*\*/g,'')}</h4>`;
        }
        if (/^\d+\.\s/.test(p.trim()) && p.length < 100) {
          return `<h4 style="margin:16px 0 6px;color:var(--navy,#003D5B)">${p.trim()}</h4>`;
        }
        return `<p style="margin-bottom:12px;line-height:1.7;text-align:justify">${p.trim().replace(/\n/g,' ')}</p>`;
      })
      .join('');

  } catch(e) {
    cont.innerHTML = `
      <div class="info-box err">
        <strong>⚠️ Gagal generate narasi AI</strong><br>
        ${e.message}<br>
        <small style="color:var(--g500)">Pastikan koneksi internet aktif dan API key Gemini valid.</small>
      </div>`;
  } finally {
    load.style.display = 'none';
    btn.disabled = false;
    txt.textContent = '✨ Generate Narasi AI';
  }
}
window._generateAI = generateAINarasi;

// ════════════════════════════════════════════════════════
//  EXPORT — CSV Alumni & Employer
// ════════════════════════════════════════════════════════
export async function exportCSV(type) {
  if (!isSuperAdmin()) return alert('Akses ditolak. Hanya superadmin.');
  const { al, em, sk } = await getData();
  const data = type==='alumni' ? al : type==='stakeholder' ? sk : em;
  if (!data.length) return alert('Belum ada data untuk diekspor.');
  const headers = Object.keys(data[0]);
  const rows    = data.map(d=>headers.map(h=>`"${String(d[h]||'').replace(/"/g,'""')}"`));
  const csv     = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
  const a       = document.createElement('a');
  a.href        = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download    = `tracer_msp_${type}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ════════════════════════════════════════════════════════
//  EXPORT EXCEL (.xlsx) — menggunakan SheetJS CDN
// ════════════════════════════════════════════════════════
export async function exportExcel() {
  if (!isSuperAdmin()) return alert('Akses ditolak. Hanya superadmin.');
  const { al, em } = await getData();
  if (!al.length && !em.length) return alert('Belum ada data.');

  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const XLSX  = window.XLSX;
  const wb    = XLSX.utils.book_new();
  const tgl   = new Date().toLocaleDateString('id-ID');

  if (al.length) {
    const wsAl = XLSX.utils.json_to_sheet(al.map(a => ({
      'Nama'        : a.nama||'',
      'NIM'         : a.nim||'',
      'Thn Masuk'   : a.masuk||'',
      'Thn Lulus'   : a.lulus||'',
      'Email'       : a.email||'',
      'HP'          : a.hp||'',
      'Gender'      : a.gender||'',
      'IPK'         : a.ipk||'',
      'Status'      : a.status||'',
      'Waktu Tunggu': a.tunggu||'',
      'Instansi'    : a.instansi||'',
      'Jabatan'     : a.jabatan||'',
      'Kota'        : a.kota||'',
      'Bidang'      : a.bidang||'',
      'Level Kerja' : a.level_kerja||'',
      'Gaji'        : a.gaji||'',
      'Kesesuaian'  : a.kesesuaian||'',
      'Rekomendasi' : a.rekomendasi||'',
      'Rtg AR1'     : a.rtg_ar1||'',
      'Rtg AR2'     : a.rtg_ar2||'',
      'Rtg AR3'     : a.rtg_ar3||'',
      'Rtg AR4'     : a.rtg_ar4||'',
      'Rtg AR5'     : a.rtg_ar5||'',
      'Rtg AR6'     : a.rtg_ar6||'',
      'Rtg AR7'     : a.rtg_ar7||'',
      'Tgl Isi'     : new Date(a.created_at).toLocaleDateString('id-ID'),
    })));
    XLSX.utils.book_append_sheet(wb, wsAl, 'Data Alumni');
  }

  if (em.length) {
    const wsEm = XLSX.utils.json_to_sheet(em.map(e => ({
      'Instansi'    : e.instansi||'',
      'Sektor'      : e.sektor||'',
      'Kota'        : e.kota||'',
      'Pengisi'     : e.pengisi||'',
      'Jabatan'     : e.jab_pengisi||'',
      'Email'       : e.email||'',
      'Telp'        : e.telp||'',
      'Alumni'      : e.alumni_nama||'',
      'Jab Alumni'  : e.alumni_jab||'',
      'Lama Kerja'  : e.lama||'',
      'Rtg ER1'     : e.rtg_er1||'',
      'Rtg ER2'     : e.rtg_er2||'',
      'Rtg ER3'     : e.rtg_er3||'',
      'Rtg ER4'     : e.rtg_er4||'',
      'Rtg ER5'     : e.rtg_er5||'',
      'Rtg ER6'     : e.rtg_er6||'',
      'Rtg ER7'     : e.rtg_er7||'',
      'Kepuasan'    : e.kepuasan||'',
      'Rekrut'      : e.rekrut||'',
      'Tgl Isi'     : new Date(e.created_at).toLocaleDateString('id-ID'),
    })));
    XLSX.utils.book_append_sheet(wb, wsEm, 'Pengguna Lulusan');
  }

  const t27b = ASPEK_LAM.map((r,i) => {
    const k  = `rtg_er${i+1}`;
    const vs = em.map(e=>e[k]).filter(Boolean);
    const avg= vs.length?(vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2):'-';
    const cnt= {sb:0,b:0,c:0,k:0};
    vs.forEach(v=>{if(v>=4)cnt.sb++;else if(v>=3)cnt.b++;else if(v>=2)cnt.c++;else cnt.k++;});
    return { 'No':i+1, 'Aspek Kompetensi':r.lbl, 'Sangat Baik(4)':cnt.sb, 'Baik(3)':cnt.b, 'Cukup(2)':cnt.c, 'Kurang(1)':cnt.k, 'Rata-rata':avg };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t27b), 'Tabel 2.7B LAM');

  const lt6  = al.filter(a=>a.tunggu&&(a.tunggu.includes('<')||a.tunggu.includes('Kurang dari 6'))).length;
  const mid  = al.filter(a=>a.tunggu&&a.tunggu.includes('6 –')).length;
  const gt18 = al.filter(a=>a.tunggu&&a.tunggu.includes('> 18')).length;
  const tot  = lt6+mid+gt18||1;
  const t28b1= [
    { 'Kategori':'WT < 6 bulan',      'Jumlah':lt6,  'Persentase': Math.round(lt6/tot*100)+'%' },
    { 'Kategori':'6 ≤ WT ≤ 18 bulan', 'Jumlah':mid,  'Persentase': Math.round(mid/tot*100)+'%' },
    { 'Kategori':'WT > 18 bulan',     'Jumlah':gt18, 'Persentase': Math.round(gt18/tot*100)+'%' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t28b1), 'Tabel 2.8B1 WT');

  const lok = al.filter(a=>a.level_kerja&&a.level_kerja.toLowerCase().includes('lokal')).length;
  const nas = al.filter(a=>a.level_kerja&&a.level_kerja.toLowerCase().includes('nasional')).length;
  const mul = al.filter(a=>a.level_kerja&&(a.level_kerja.toLowerCase().includes('multinasional')||a.level_kerja.toLowerCase().includes('internasional'))).length;
  const t28b2= [
    { 'Tingkat':'Lokal/Wilayah/Wirausaha',   'Jumlah':lok, 'Persentase': Math.round(lok/al.length*100||0)+'%' },
    { 'Tingkat':'Nasional/Berbadan Hukum',    'Jumlah':nas, 'Persentase': Math.round(nas/al.length*100||0)+'%' },
    { 'Tingkat':'Multinasional/Internasional','Jumlah':mul, 'Persentase': Math.round(mul/al.length*100||0)+'%' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t28b2), 'Tabel 2.8B2 TK');

  XLSX.writeFile(wb, `Laporan_TracerStudy_MSP_FPIK_UNSRAT_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ════════════════════════════════════════════════════════
//  EXPORT WORD (.docx) — menggunakan docx.js CDN
// ════════════════════════════════════════════════════════
export async function exportWord() {
  if (!isSuperAdmin()) return alert('Akses ditolak. Hanya superadmin.');
  const { al, em } = await getData();

  if (!window.docx) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/docx@8.5.0/build/index.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const { Document, Paragraph, Table, TableRow, TableCell,
          TextRun, HeadingLevel, AlignmentType, WidthType,
          BorderStyle, Packer } = window.docx;

  const tgl   = new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  const avg7  = avgRtg(em,['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
  const lt6   = al.filter(a=>a.tunggu&&(a.tunggu.includes('<')||a.tunggu.includes('Kurang dari 6'))).length;
  const pctLt6= al.length?Math.round(lt6/al.length*100):0;

  const mkRow = (cells, bold=false) => new TableRow({
    children: cells.map(c => new TableCell({
      children: [new Paragraph({ children:[new TextRun({text:String(c),bold,size:20})] })],
      width:{ size: Math.floor(9000/cells.length), type: WidthType.DXA }
    }))
  });

  const rows27b = ASPEK_LAM.map((r,i) => {
    const k  = `rtg_er${i+1}`;
    const vs = em.map(e=>e[k]).filter(Boolean);
    const avg= vs.length?(vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2):'-';
    const cnt={sb:0,b:0,c:0,k:0};
    vs.forEach(v=>{if(v>=4)cnt.sb++;else if(v>=3)cnt.b++;else if(v>=2)cnt.c++;else cnt.k++;});
    return mkRow([i+1, r.lbl, cnt.sb, cnt.b, cnt.c, cnt.k, avg]);
  });

  const doc = new Document({ sections:[{ children:[
    new Paragraph({ text:'LAPORAN TRACER STUDY', heading:HeadingLevel.HEADING_1, alignment:AlignmentType.CENTER }),
    new Paragraph({ text:'Program Studi Manajemen Sumber Daya Perairan', heading:HeadingLevel.HEADING_2, alignment:AlignmentType.CENTER }),
    new Paragraph({ text:'Fakultas Perikanan dan Ilmu Kelautan · Universitas Sam Ratulangi', alignment:AlignmentType.CENTER, children:[new TextRun({text:'Fakultas Perikanan dan Ilmu Kelautan · Universitas Sam Ratulangi',size:22})] }),
    new Paragraph({ text:`Dicetak: ${tgl}`, alignment:AlignmentType.CENTER, children:[new TextRun({text:`Dicetak: ${tgl}`,size:20,color:'666666'})] }),
    new Paragraph(''),
    new Paragraph({ text:'A. Ringkasan Data', heading:HeadingLevel.HEADING_2 }),
    new Paragraph({ children:[new TextRun({text:`• Total Responden Alumni       : ${al.length} orang`,size:22})] }),
    new Paragraph({ children:[new TextRun({text:`• Total Responden Atasan Langsung Alumni : ${em.length} instansi/perusahaan`,size:22})] }),
    new Paragraph({ children:[new TextRun({text:`• Rata-rata 7 Aspek LAM PTIP  : ${avg7} / 5`,size:22})] }),
    new Paragraph({ children:[new TextRun({text:`• Lulusan WT < 6 bulan        : ${pctLt6}%`,size:22})] }),
    new Paragraph(''),
    new Paragraph({ text:'B. Tabel 2.7B — Kepuasan Pengguna Lulusan', heading:HeadingLevel.HEADING_2 }),
    new Table({ rows:[
      mkRow(['No','Aspek Kompetensi','Sangat Baik(4)','Baik(3)','Cukup(2)','Kurang(1)','Rata-rata'], true),
      ...rows27b
    ]}),
    new Paragraph(''),
    new Paragraph({ text:'C. Tabel 2.8B1 — Waktu Tunggu Lulusan', heading:HeadingLevel.HEADING_2 }),
    new Table({ rows:[
      mkRow(['Kategori Waktu Tunggu','Jumlah','Persentase'], true),
      mkRow(['WT < 6 bulan', lt6, pctLt6+'%']),
      mkRow(['6 ≤ WT ≤ 18 bulan', al.filter(a=>a.tunggu&&a.tunggu.includes('6 –')).length, '-']),
      mkRow(['WT > 18 bulan', al.filter(a=>a.tunggu&&a.tunggu.includes('> 18')).length, '-']),
    ]}),
    new Paragraph(''),
    new Paragraph({ text:'D. Tabel 2.8B2 — Tingkat Tempat Kerja', heading:HeadingLevel.HEADING_2 }),
    new Table({ rows:[
      mkRow(['Tingkat Tempat Kerja','Jumlah','Persentase'], true),
      mkRow(['Lokal/Wilayah/Wirausaha', al.filter(a=>a.level_kerja&&a.level_kerja.toLowerCase().includes('lokal')).length, '-']),
      mkRow(['Nasional/Berbadan Hukum', al.filter(a=>a.level_kerja&&a.level_kerja.toLowerCase().includes('nasional')).length, '-']),
      mkRow(['Multinasional/Internasional', al.filter(a=>a.level_kerja&&(a.level_kerja.toLowerCase().includes('multinasional')||a.level_kerja.toLowerCase().includes('internasional'))).length, '-']),
    ]}),
  ]}]});

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`Laporan_TracerStudy_MSP_FPIK_UNSRAT_${new Date().toISOString().slice(0,10)}.docx`;
  a.click(); URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════════
//  EXPORT PDF — via Print dialog (CSS print)
// ════════════════════════════════════════════════════════
export function exportPDF() {
  admTab('analisis');
  setTimeout(() => {
    const style = document.createElement('style');
    style.id = 'pdf-print-style';
    style.innerHTML = `
      @media print {
        body * { visibility: hidden; }
        #print-area, #print-area * { visibility: visible; }
        #print-area { position: fixed; top: 0; left: 0; width: 100%; }
        .exp-btn, button, #btn-ai { display: none !important; }
      }`;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => {
      const el = document.getElementById('pdf-print-style');
      if (el) el.remove();
    }, 1500);
  }, 500);
}

// ════════════════════════════════════════════════════════
//  PRINT LAPORAN
// ════════════════════════════════════════════════════════
export function printLaporan() { window.print(); }

window._exportCSV    = exportCSV;
window._exportExcel  = exportExcel;
window._exportWord   = exportWord;
window._exportPDF    = exportPDF;
window._printLaporan = printLaporan;

// ════════════════════════════════════════════════════════
//  SAVE AS — Excel per Tab
// ════════════════════════════════════════════════════════
export async function saveAsExcel(type) {
  if (!isSuperAdmin()) return alert('Akses ditolak. Hanya superadmin.');
  const { al, em, sk } = await getData();

  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const XLSX = window.XLSX;
  const wb   = XLSX.utils.book_new();
  const tgl  = new Date().toISOString().slice(0,10);

  if (type === 'alumni') {
    if (!al.length) return alert('Belum ada data alumni.');
    const ws = XLSX.utils.json_to_sheet(al.map(a => ({
      'Nama': a.nama||'', 'NIM': a.nim||'', 'Thn Masuk': a.masuk||'', 'Thn Lulus': a.lulus||'',
      'Email': a.email||'', 'HP': a.hp||'', 'Gender': a.gender||'', 'IPK': a.ipk||'',
      'Status': a.status||'', 'Waktu Tunggu': a.tunggu||'', 'Instansi': a.instansi||'',
      'Jabatan': a.jabatan||'', 'Kota': a.kota||'', 'Bidang': a.bidang||'',
      'Level Kerja': a.level_kerja||'', 'Gaji': a.gaji||'', 'Kesesuaian': a.kesesuaian||'',
      'Rekomendasi': a.rekomendasi||'',
      'Rtg AR1': a.rtg_ar1||'', 'Rtg AR2': a.rtg_ar2||'', 'Rtg AR3': a.rtg_ar3||'',
      'Rtg AR4': a.rtg_ar4||'', 'Rtg AR5': a.rtg_ar5||'', 'Rtg AR6': a.rtg_ar6||'',
      'Rtg AR7': a.rtg_ar7||'', 'Tgl Isi': new Date(a.created_at).toLocaleDateString('id-ID'),
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Data Alumni');
    XLSX.writeFile(wb, `DataAlumni_MSP_${tgl}.xlsx`);

  } else if (type === 'employer') {
    if (!em.length) return alert('Belum ada data pengguna lulusan.');
    const ws = XLSX.utils.json_to_sheet(em.map(e => ({
      'Instansi': e.instansi||'', 'Sektor': e.sektor||'', 'Kota': e.kota||'',
      'Pengisi': e.pengisi||'', 'Jabatan': e.jab_pengisi||'', 'Email': e.email||'',
      'Telp': e.telp||'', 'Alumni': e.alumni_nama||'', 'Jab Alumni': e.alumni_jab||'',
      'Lama Kerja': e.lama||'',
      'Rtg ER1': e.rtg_er1||'', 'Rtg ER2': e.rtg_er2||'', 'Rtg ER3': e.rtg_er3||'',
      'Rtg ER4': e.rtg_er4||'', 'Rtg ER5': e.rtg_er5||'', 'Rtg ER6': e.rtg_er6||'',
      'Rtg ER7': e.rtg_er7||'', 'Kepuasan': e.kepuasan||'', 'Rekrut': e.rekrut||'',
      'Tgl Isi': new Date(e.created_at).toLocaleDateString('id-ID'),
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Pengguna Lulusan');
    XLSX.writeFile(wb, `DataPenggunaLulusan_MSP_${tgl}.xlsx`);

  } else if (type === 'stakeholder') {
    if (!sk.length) return alert('Belum ada data stakeholder.');
    const ws = XLSX.utils.json_to_sheet(sk.map(s => ({
      'Tahun Survei': s.tahun_survei||'', 'Jenis': s.jenis||'', 'Nama': s.nama||'',
      'Instansi': s.instansi||'', 'Email': s.email||'',
      'Rtg SK1': s.rtg_sk1||'', 'Rtg SK2': s.rtg_sk2||'', 'Rtg SK3': s.rtg_sk3||'',
      'Rtg SK4': s.rtg_sk4||'', 'Rtg SK5': s.rtg_sk5||'', 'Rtg SK6': s.rtg_sk6||'',
      'Rtg SK7': s.rtg_sk7||'', 'Kepuasan': s.kepuasan||'', 'Saran': s.saran||'',
      'Tgl Isi': new Date(s.created_at).toLocaleDateString('id-ID'),
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Stakeholder');
    XLSX.writeFile(wb, `DataStakeholder_MSP_${tgl}.xlsx`);
  }
}

// ════════════════════════════════════════════════════════
//  SAVE AS — PDF per Tab (via jsPDF + autoTable CDN)
// ════════════════════════════════════════════════════════
export async function saveAsPDF(type) {
  if (!isSuperAdmin()) return alert('Akses ditolak. Hanya superadmin.');
  const { al, em, sk } = await getData();

  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  if (!window.jspdf?.API?.autoTable && !window.jsPDFAutoTable) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const tgl = new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
  const tglFile = new Date().toISOString().slice(0,10);

  const addHeader = (title, subtitle) => {
    doc.setFillColor(0, 61, 91);
    doc.rect(0, 0, doc.internal.pageSize.width, 50, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica','bold');
    doc.text('TRACER STUDY — MSP FPIK UNSRAT', 36, 20);
    doc.setFontSize(11); doc.setFont('helvetica','normal');
    doc.text(title, 36, 34);
    doc.setFontSize(9);
    doc.text(`Dicetak: ${tgl}  |  ${subtitle}`, 36, 46);
    doc.setTextColor(0, 0, 0);
  };

  if (type === 'alumni') {
    if (!al.length) return alert('Belum ada data alumni.');
    addHeader('Data Alumni', `${al.length} responden`);
    doc.autoTable({
      startY: 60,
      head: [['Nama','NIM','Lulus','Email','Status','Instansi','Bidang','W.Tunggu','Kesesuaian','Gaji']],
      body: al.map(a => [
        a.nama||'–', a.nim||'–', a.lulus||'–', a.email||'–',
        a.status||'–', a.instansi||'–', (a.bidang||'–').split('(')[0].trim(),
        a.tunggu||'–', a.kesesuaian||'–', a.gaji||'–',
      ]),
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [0,109,119], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240,250,251] },
      margin: { left: 24, right: 24 },
    });
    doc.save(`DataAlumni_MSP_${tglFile}.pdf`);

  } else if (type === 'employer') {
    if (!em.length) return alert('Belum ada data pengguna lulusan.');
    addHeader('Data Pengguna Lulusan', `${em.length} responden`);
    doc.autoTable({
      startY: 60,
      head: [['Instansi','Sektor','Kota','Pengisi','Email','Alumni','Kepuasan','Rekrut','Tgl Isi']],
      body: em.map(e => [
        e.instansi||'–', e.sektor||'–', e.kota||'–', e.pengisi||'–', e.email||'–',
        e.alumni_nama||'–', e.kepuasan||'–', e.rekrut||'–',
        new Date(e.created_at).toLocaleDateString('id-ID'),
      ]),
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [0,61,91], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240,250,251] },
      margin: { left: 24, right: 24 },
    });
    doc.save(`DataPenggunaLulusan_MSP_${tglFile}.pdf`);

  } else if (type === 'stakeholder') {
    if (!sk.length) return alert('Belum ada data stakeholder.');
    addHeader('Data Kepuasan Stakeholder (Tabel 2.7C)', `${sk.length} responden`);
    doc.autoTable({
      startY: 60,
      head: [['Tahun','Jenis','Nama','Instansi','SK1','SK2','SK3','SK4','SK5','SK6','SK7','Kepuasan']],
      body: sk.map(s => [
        s.tahun_survei||'–', s.jenis||'–', s.nama||'–', s.instansi||'–',
        s.rtg_sk1||'–', s.rtg_sk2||'–', s.rtg_sk3||'–', s.rtg_sk4||'–',
        s.rtg_sk5||'–', s.rtg_sk6||'–', s.rtg_sk7||'–', s.kepuasan||'–',
      ]),
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [27,122,74], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [230,245,238] },
      margin: { left: 24, right: 24 },
    });
    doc.save(`DataStakeholder_MSP_${tglFile}.pdf`);
  }
}

window._saveAsExcel = saveAsExcel;
window._saveAsPDF   = saveAsPDF;

// ════════════════════════════════════════════════════════
//  CHART HELPERS
// ════════════════════════════════════════════════════════
function dChart(id) { if(charts[id]){charts[id].destroy();delete charts[id];} }

function mkChart(id, type, dataMap) {
  dChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type,
    data:{labels:Object.keys(dataMap),datasets:[{data:Object.values(dataMap),backgroundColor:CHART_COLORS,borderWidth:0,borderRadius:type==='bar'?4:0}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:type==='bar'?'top':'right',labels:{font:{size:10},padding:8,boxWidth:10}}},
      scales:type==='bar'?{y:{beginAtZero:true,ticks:{stepSize:1}},x:{ticks:{font:{size:9}}}}:undefined}
  });
}

function mkHBar(id, labels, data, color) {
  dChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{label:'Rata-rata',data,backgroundColor:color,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:false}},
      scales:{x:{min:0,max:5,ticks:{stepSize:1}},y:{ticks:{font:{size:9}}}}}
  });
}

function countBy(arr, key) {
  const m={};arr.forEach(a=>{const v=a[key]||'N/A';m[v]=(m[v]||0)+1;});return m;
}
function avgOf(arr, key) {
  const vs=arr.map(a=>a[key]).filter(Boolean);
  return vs.length?+(vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2):0;
}
function avgRtg(arr, keys) {
  if (!arr||!arr.length) return '–';
  const tot=arr.reduce((s,r)=>s+keys.reduce((ss,k)=>ss+(r[k]||0),0),0);
  return (tot/(arr.length*keys.length)).toFixed(2);
}
