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
    case 'excel':    return renderExcelPanel();
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

  // ── Normalisasi: pastikan tahun_survei selalu integer & jenis selalu string trim
  // Map nilai lama (dengan "Aktif") ke nama resmi LKPS
  const JENIS_NORM = {
    'Mahasiswa Aktif'           : 'Mahasiswa',
    'Dosen Aktif'               : 'Dosen',
    'Tenaga Kependidikan Aktif' : 'Tenaga Kependidikan',
    'Lulusan / Alumni'          : 'Lulusan',
    'Mitra / Instansi Mitra'    : 'Mitra',
  };
  const normSk = (sk || []).map(x => {
    const jRaw = (x.jenis || '').trim();
    return {
      ...x,
      tahun_survei : x.tahun_survei != null ? parseInt(x.tahun_survei) : null,
      jenis        : JENIS_NORM[jRaw] || jRaw,
    };
  });

  _cache = { al: al || [], em: em || [], sk: normSk, ts: Date.now() };
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

  const totalEm = em.length || 1;
  const t27b = ASPEK_LAM.map((r, i) => {
    const k   = `rtg_er${i+1}`;
    const vs  = em.map(e => e[k]).filter(Boolean);
    const cnt = { 4:0, 3:0, 2:0, 1:0 };
    vs.forEach(v => { const cat = v>=4?4:v>=3?3:v>=2?2:1; cnt[cat]++; });
    // Persentase masing-masing kategori dari total responden
    const pct = cat => vs.length ? (cnt[cat] / totalEm * 100).toFixed(2) : '0.00';
    // Jumlah % kepuasan = (SB + B) / total × 100
    const jumlahPct = vs.length ? ((cnt[4] + cnt[3]) / totalEm * 100).toFixed(2) : '0.00';
    return `<tr>
      <td style="text-align:center">${i+1}</td>
      <td>${r.lbl}</td>
      <td style="text-align:center;background:#fffde7">${pct(4)}</td>
      <td style="text-align:center;background:#fffde7">${pct(3)}</td>
      <td style="text-align:center;background:#fffde7">${pct(2)}</td>
      <td style="text-align:center;background:#fffde7">${pct(1)}</td>
      <td style="text-align:center;font-weight:700;background:#fffde7">${jumlahPct}</td>
      <td style="color:var(--g400);font-size:11px;font-style:italic">—</td>
    </tr>`;
  }).join('');

  // Baris jumlah total (sum semua persen per kolom)
  const totalRow = (() => {
    const cols = [4,3,2,1].map(cat => {
      const sum = ASPEK_LAM.reduce((s,_,i) => {
        const k = `rtg_er${i+1}`;
        const vs = em.map(e=>e[k]).filter(Boolean);
        const cnt = {4:0,3:0,2:0,1:0};
        vs.forEach(v=>{const c=v>=4?4:v>=3?3:v>=2?2:1;cnt[c]++;});
        return s + (vs.length ? cnt[cat]/totalEm*100 : 0);
      }, 0);
      return sum.toFixed(2);
    });
    const sbSum = ASPEK_LAM.reduce((s,_,i)=>{
      const k=`rtg_er${i+1}`;const vs=em.map(e=>e[k]).filter(Boolean);
      const cnt={4:0,3:0};vs.forEach(v=>{if(v>=4)cnt[4]++;else if(v>=3)cnt[3]++;});
      return s+(vs.length?(cnt[4]+cnt[3])/totalEm*100:0);
    },0);
    return `<tr style="background:var(--g50);font-weight:700">
      <td colspan="2" style="text-align:center">Jumlah</td>
      <td style="text-align:center;background:#fffde7">${cols[0]}</td>
      <td style="text-align:center;background:#fffde7">${cols[1]}</td>
      <td style="text-align:center;background:#fffde7">${cols[2]}</td>
      <td style="text-align:center;background:#fffde7">${cols[3]}</td>
      <td style="text-align:center;background:#fffde7">${sbSum.toFixed(2)}</td>
      <td></td>
    </tr>`;
  })();

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
    <span style="font-size:11px;color:var(--g500);margin-left:8px">Satuan: % dari total responden</span>
  </div>
  <div class="tw" style="margin-bottom:24px;overflow-x:auto">
    <table class="dt" style="min-width:700px">
      <thead>
        <tr>
          <th rowspan="2" style="text-align:center;vertical-align:middle;width:30px">No</th>
          <th rowspan="2" style="text-align:center;vertical-align:middle">Jenis Kemampuan</th>
          <th colspan="4" style="text-align:center;background:#fffde7;color:#7c6f00">Tingkat Kepuasan Pengguna (%)</th>
          <th rowspan="2" style="text-align:center;vertical-align:middle;background:#fffde7;color:#7c6f00;min-width:80px">Jumlah Persentase Kepuasan Pengguna (%)</th>
          <th rowspan="2" style="text-align:center;vertical-align:middle;min-width:160px">Rencana Tindak Lanjut oleh UPPS/PS</th>
        </tr>
        <tr>
          <th style="text-align:center;background:#fffde7;color:#7c6f00">Sangat Baik</th>
          <th style="text-align:center;background:#fffde7;color:#7c6f00">Baik</th>
          <th style="text-align:center;background:#fffde7;color:#7c6f00">Cukup</th>
          <th style="text-align:center;background:#fffde7;color:#7c6f00">Kurang</th>
        </tr>
        <tr style="background:var(--g100);font-size:11px;color:var(--g500)">
          <th style="text-align:center">1</th><th style="text-align:center">2</th>
          <th style="text-align:center">3</th><th style="text-align:center">4</th>
          <th style="text-align:center">5</th><th style="text-align:center">6</th>
          <th style="text-align:center">7</th><th style="text-align:center">8</th>
        </tr>
      </thead>
      <tbody>${t27b}${totalRow}</tbody>
    </table>
    <p style="font-size:11px;color:var(--g500);margin-top:8px;font-style:italic">
      * Jumlah Persentase Kepuasan = (Sangat Baik + Baik) / Total Responden × 100%.
      Total responden: <strong>${em.length}</strong> pengguna lulusan.
    </p>
  </div>
  <div class="info-box lam" style="margin-bottom:16px">
    <strong>📊 Tabel 2.8B1 — Waktu Tunggu Mendapatkan Pekerjaan</strong>
    <span style="font-size:11px;color:var(--g500);margin-left:6px">Per tahun lulus (TS-4, TS-3, TS-2)</span>
  </div>
  <div class="tw" style="margin-bottom:8px;overflow-x:auto">
    ${(() => {
      const { rows: r81, tot: t81 } = build28B1Data(al);
      const mkR = (r, bold) => `<tr${bold?' style="font-weight:700;background:var(--g50)"':''}>
        <td style="text-align:center">${r.label}</td>
        <td style="text-align:center">${r.jumlah}</td>
        <td style="text-align:center">${r.terlacak}</td>
        <td style="text-align:center;background:#fffde7">${r.lt6}</td>
        <td style="text-align:center;background:#fffde7">${r.mid}</td>
        <td style="text-align:center;background:#fffde7">${r.gt18}</td>
      </tr>`;
      return `<table class="dt" style="min-width:560px">
        <thead>
          <tr>
            <th rowspan="2" style="text-align:center;vertical-align:middle">Tahun Lulus</th>
            <th rowspan="2" style="text-align:center;vertical-align:middle">Jumlah Lulusan</th>
            <th rowspan="2" style="text-align:center;vertical-align:middle">Jumlah Lulusan yang Terlacak</th>
            <th colspan="3" style="text-align:center;background:#fffde7;color:#7c6f00">Jumlah Lulusan Terlacak dengan Waktu Tunggu<br>Mendapatkan Pekerjaan</th>
          </tr>
          <tr>
            <th style="text-align:center;background:#fffde7;color:#7c6f00">WT &lt; 6 bulan</th>
            <th style="text-align:center;background:#fffde7;color:#7c6f00">6 ≤ WT ≤ 18 bulan</th>
            <th style="text-align:center;background:#fffde7;color:#7c6f00">WT &gt; 18 bulan</th>
          </tr>
          <tr style="background:var(--g100);font-size:10px;color:var(--g500);text-align:center">
            <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th>
          </tr>
        </thead>
        <tbody>
          ${r81.map(r=>mkR(r,false)).join('')}
          ${mkR({label:'Jumlah',...t81},true)}
        </tbody>
      </table>`;
    })()}
  </div>
  <div class="info-box lam" style="margin-bottom:16px">
    <strong>WT1 (% lulusan dengan WT &lt; 6 bln dari terlacak) = ${pctLt6}%</strong>
  </div>
  <div class="info-box lam" style="margin-bottom:16px">
    <strong>📊 Tabel 2.8B2 — Tempat Kerja / Berwirausaha (${al.length} responden)</strong>
    <span style="font-size:11px;color:var(--g500);margin-left:6px">Per tahun lulus (TS-4, TS-3, TS-2)</span>
  </div>
  <div class="tw" style="overflow-x:auto">
    ${(() => {
      const { rows: r28, tot: t28 } = build28B2Data(al);
      const mkR = (r, bold) => `<tr${bold?' style="font-weight:700;background:var(--g50)"':''}>
        <td style="text-align:center">${r.label}</td>
        <td style="text-align:center">${r.jumlah||0}</td>
        <td style="text-align:center">${r.terlacak||0}</td>
        <td style="text-align:center;background:#fffde7">${r.lok||0}</td>
        <td style="text-align:center;background:#fffde7">${r.nas||0}</td>
        <td style="text-align:center;background:#fffde7">${r.mul||0}</td>
      </tr>`;
      return `<table class="dt" style="min-width:580px">
        <thead>
          <tr>
            <th rowspan="2" style="text-align:center;vertical-align:middle">Tahun Lulus</th>
            <th rowspan="2" style="text-align:center;vertical-align:middle">Jumlah<br>Lulusan</th>
            <th rowspan="2" style="text-align:center;vertical-align:middle">Jumlah Lulusan<br>yang Terlacak</th>
            <th colspan="3" style="text-align:center;background:#fffde7;color:#7c6f00">Jumlah Lulusan Terlacak yang Bekerja Berdasarkan<br>Tingkat/Ukuran Tempat Kerja/Berwirausaha</th>
          </tr>
          <tr>
            <th style="text-align:center;background:#fffde7;color:#7c6f00;font-size:11px">Lokal/Wilayah/<br>Berwirausaha tidak<br>Berbadan Hukum</th>
            <th style="text-align:center;background:#fffde7;color:#7c6f00;font-size:11px">Nasional/<br>Berwirausaha<br>Berbadan Hukum</th>
            <th style="text-align:center;background:#fffde7;color:#7c6f00;font-size:11px">Multinasional/<br>Internasional</th>
          </tr>
          <tr style="background:var(--g100);font-size:10px;color:var(--g500);text-align:center">
            <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th>
          </tr>
        </thead>
        <tbody>
          ${r28.map(r=>mkR(r,false)).join('')}
          ${mkR({label:'Jumlah',...t28},true)}
        </tbody>
      </table>`;
    })()}
  </div>
  <div class="info-box lam" style="margin-bottom:16px">
    <strong>📊 Tabel 2.7C — Kepuasan Stakeholder Internal &amp; Eksternal (${_cache.sk?.length||0} responden)</strong>
  </div>
  <div class="tw">
    ${render27CTable(_cache.sk||[], _cache.em||[])}
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
  const totalEm = em.length;
  const rows = ASPEK_LAM.map((r,i) => {
    const k  = `rtg_er${i+1}`;
    const vs = em.map(e=>e[k]).filter(Boolean);
    const cnt= {4:0,3:0,2:0,1:0};
    vs.forEach(v=>{const c=v>=4?4:v>=3?3:v>=2?2:1;cnt[c]++;});
    const pct = cat => vs.length ? (cnt[cat]/totalEm*100).toFixed(2) : '0.00';
    const jumlahPct = vs.length ? ((cnt[4]+cnt[3])/totalEm*100).toFixed(2) : '0.00';
    return `<tr>
      <td style="text-align:center">${i+1}</td><td>${r.lbl}</td>
      <td style="text-align:center;background:#fffde7">${pct(4)}</td>
      <td style="text-align:center;background:#fffde7">${pct(3)}</td>
      <td style="text-align:center;background:#fffde7">${pct(2)}</td>
      <td style="text-align:center;background:#fffde7">${pct(1)}</td>
      <td style="text-align:center;font-weight:700;background:#fffde7">${jumlahPct}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="tw" style="overflow-x:auto"><table class="dt" style="min-width:600px">
    <thead>
      <tr>
        <th rowspan="2" style="text-align:center;vertical-align:middle">No</th>
        <th rowspan="2" style="text-align:center;vertical-align:middle">Jenis Kemampuan</th>
        <th colspan="4" style="text-align:center;background:#fffde7;color:#7c6f00">Tingkat Kepuasan Pengguna (%)</th>
        <th rowspan="2" style="text-align:center;vertical-align:middle;background:#fffde7;color:#7c6f00">Jumlah %<br>Kepuasan</th>
      </tr>
      <tr>
        <th style="background:#fffde7;color:#7c6f00;text-align:center">Sangat Baik</th>
        <th style="background:#fffde7;color:#7c6f00;text-align:center">Baik</th>
        <th style="background:#fffde7;color:#7c6f00;text-align:center">Cukup</th>
        <th style="background:#fffde7;color:#7c6f00;text-align:center">Kurang</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:11px;color:var(--g500);margin-top:6px;font-style:italic">
    Satuan: % dari ${totalEm} total responden pengguna lulusan. Jumlah % = (Sangat Baik + Baik) / Total × 100%.
  </p></div>`;
}

function renderLAM27C(sk) {
  const el = document.getElementById('sec-27c');
  if (!el) return;
  if (!sk || !sk.length) { el.innerHTML = '<div class="empty">Belum ada data kepuasan stakeholder.</div>'; return; }
  el.innerHTML = `<div class="tw">${render27CTable(sk, _cache.em||[])}</div>`;
}

// ── Helper: semua tahun lulus unik dari data, diurutkan naik
function getAllTahunLulus(al) {
  const s = new Set(al.map(a => parseInt(a.lulus)).filter(t => !isNaN(t)));
  return [...s].sort((a,b) => a - b);
}

// ── Helper: label tahun relatif (TS-4, TS-3, dst)
function labelTahun(yr) {
  const TS = TAHUN_SURVEI.TS;
  const d = TS - yr;
  return d === 0 ? `TS (${yr})` : d > 0 ? `TS-${d} (${yr})` : `TS+${Math.abs(d)} (${yr})`;
}

// ── Helper: 2.8B1 — SEMUA tahun dari data
function build28B1Data(al) {
  const isLt6  = a => a.tunggu && (a.tunggu.includes('< 6') || a.tunggu.includes('<6') || a.tunggu.includes('Kurang dari 6'));
  const is6_18 = a => a.tunggu && (a.tunggu.includes('6 –') || a.tunggu.includes('6 -') || a.tunggu.includes('6-') || a.tunggu.includes('6 ≤'));
  const isGt18 = a => a.tunggu && (a.tunggu.includes('> 18') || a.tunggu.includes('>18'));

  const rows = getAllTahunLulus(al).map(yr => {
    const grp      = al.filter(a => parseInt(a.lulus) === yr);
    // Terlacak = semua yang mengisi formulir (ada status)
    const terlacak = grp.filter(a => a.status && a.status.trim() !== '');
    // Bekerja = hanya yang punya pekerjaan (untuk kolom WT)
    const bekerja  = terlacak.filter(a => a.status.includes('Bekerja'));
    return { label: labelTahun(yr), jumlah: grp.length, terlacak: terlacak.length,
             lt6: bekerja.filter(isLt6).length, mid: bekerja.filter(is6_18).length, gt18: bekerja.filter(isGt18).length };
  });

  const noYr = al.filter(a => !a.lulus || isNaN(parseInt(a.lulus)));
  if (noYr.length) {
    const terlacak = noYr.filter(a => a.status && a.status.trim() !== '');
    const bekerja  = terlacak.filter(a => a.status.includes('Bekerja'));
    rows.push({ label: '(Tahun tidak diisi)', jumlah: noYr.length, terlacak: terlacak.length,
                lt6: bekerja.filter(isLt6).length, mid: bekerja.filter(is6_18).length, gt18: bekerja.filter(isGt18).length });
  }

  const tot = { jumlah: al.length,
    terlacak: rows.reduce((s,r)=>s+r.terlacak,0), lt6: rows.reduce((s,r)=>s+r.lt6,0),
    mid: rows.reduce((s,r)=>s+r.mid,0), gt18: rows.reduce((s,r)=>s+r.gt18,0) };
  return { rows, tot };
}

// ── Helper: 2.8B2 — SEMUA tahun dari data
function build28B2Data(al) {
  const isLok = a => a.level_kerja && a.level_kerja.toLowerCase().includes('lokal');
  const isNas = a => a.level_kerja && a.level_kerja.toLowerCase().includes('nasional');
  const isMul = a => a.level_kerja && (a.level_kerja.toLowerCase().includes('multinasional') || a.level_kerja.toLowerCase().includes('internasional'));

  const rows = getAllTahunLulus(al).map(yr => {
    const grp      = al.filter(a => parseInt(a.lulus) === yr);
    const terlacak = grp.filter(a => a.status && a.status.trim() !== '');
    const bekerja  = terlacak.filter(a => a.status.includes('Bekerja'));
    return { label: labelTahun(yr), jumlah: grp.length, terlacak: terlacak.length,
             lok: bekerja.filter(isLok).length, nas: bekerja.filter(isNas).length, mul: bekerja.filter(isMul).length };
  });

  const noYr = al.filter(a => !a.lulus || isNaN(parseInt(a.lulus)));
  if (noYr.length) {
    const terlacak = noYr.filter(a => a.status && a.status.trim() !== '');
    const bekerja  = terlacak.filter(a => a.status.includes('Bekerja'));
    rows.push({ label: '(Tahun tidak diisi)', jumlah: noYr.length, terlacak: terlacak.length,
                lok: bekerja.filter(isLok).length, nas: bekerja.filter(isNas).length, mul: bekerja.filter(isMul).length });
  }

  const tot = { jumlah: al.length,
    terlacak: rows.reduce((s,r)=>s+r.terlacak,0), lok: rows.reduce((s,r)=>s+r.lok,0),
    nas: rows.reduce((s,r)=>s+r.nas,0), mul: rows.reduce((s,r)=>s+r.mul,0) };
  return { rows, tot };
}

function renderLAM28B2(al) {
  const el = document.getElementById('sec-28b2');
  if (!al.length) { el.innerHTML = '<div class="empty">Belum ada data alumni.</div>'; return; }

  const { rows, tot } = build28B2Data(al);

  const mkRow = (r, isTot=false) => `
    <tr${isTot ? ' style="font-weight:700;background:var(--g50)"' : ''}>
      <td style="text-align:center${isTot?';font-weight:700':''}">${r.label}</td>
      <td style="text-align:center">${r.jumlah || 0}</td>
      <td style="text-align:center">${r.terlacak || 0}</td>
      <td style="text-align:center;background:#fffde7">${r.lok || 0}</td>
      <td style="text-align:center;background:#fffde7">${r.nas || 0}</td>
      <td style="text-align:center;background:#fffde7">${r.mul || 0}</td>
    </tr>`;

  el.innerHTML = `<div class="tw" style="overflow-x:auto"><table class="dt" style="min-width:600px">
    <thead>
      <tr>
        <th rowspan="2" style="text-align:center;vertical-align:middle">Tahun Lulus</th>
        <th rowspan="2" style="text-align:center;vertical-align:middle">Jumlah Lulusan</th>
        <th rowspan="2" style="text-align:center;vertical-align:middle">Jumlah Lulusan yang Terlacak</th>
        <th colspan="3" style="text-align:center;background:#fffde7;color:#7c6f00">Jumlah Lulusan Terlacak yang Bekerja Berdasarkan<br>Tingkat/Ukuran Tempat Kerja/Berwirausaha</th>
      </tr>
      <tr>
        <th style="text-align:center;background:#fffde7;color:#7c6f00;font-size:11px">Lokal/Wilayah/<br>Berwirausaha tidak<br>Berbadan Hukum</th>
        <th style="text-align:center;background:#fffde7;color:#7c6f00;font-size:11px">Nasional/<br>Berwirausaha<br>Berbadan Hukum</th>
        <th style="text-align:center;background:#fffde7;color:#7c6f00;font-size:11px">Multinasional/<br>Internasional</th>
      </tr>
      <tr style="background:var(--g100);font-size:10px;color:var(--g500);text-align:center">
        <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => mkRow(r)).join('')}
      ${mkRow({ label:'Jumlah', ...tot }, true)}
    </tbody>
  </table>
  <p style="font-size:11px;color:var(--g500);margin-top:6px;font-style:italic">
    * TS = Tahun Survei (${TAHUN_SURVEI.TS}). Hanya mencakup alumni 3 tahun terakhir sesuai format LKPS LAM PTIP IAPS 1.0.
  </p></div>`;
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

function render27CTable(sk, em) {
  const _em = em || _cache.em || [];
  const cfg = getSkConfig();

  // Header persis sesuai Tabel 2.7C LKPS LAM PTIP IAPS 1.0
  const headerRow = `
    <thead>
      <tr style="background:var(--navy);color:#fff;font-size:11px;text-align:center">
        <th rowspan="3" style="vertical-align:middle;width:28px">No</th>
        <th rowspan="3" style="vertical-align:middle;min-width:110px">Stakeholder</th>
        <th colspan="2" style="text-align:center">Instrumen</th>
        <th colspan="3" style="text-align:center">Jumlah Responden</th>
        <th colspan="3" style="text-align:center">Persentase Keterwakilan Responden</th>
        <th colspan="4" style="text-align:center">Jumlah Responden yang menjawab layanan<br><span style="font-weight:400;font-size:10px">(SB (Sangat Baik) = 4, B (Baik) = 3, C (Cukup) = 2, dan K (Kurang) = 1)</span></th>
        <th rowspan="3" style="vertical-align:middle;min-width:56px">Skor</th>
        <th rowspan="3" style="vertical-align:middle;min-width:130px">Tindak Lanjut</th>
      </tr>
      <tr style="background:var(--navy-md);color:#fff;font-size:10px;text-align:center">
        <th>Ada</th>
        <th>Tidak Ada</th>
        <th>TS-2<br>(${TAHUN.TS2})</th>
        <th>TS-1<br>(${TAHUN.TS1})</th>
        <th>TS<br>(${TAHUN.TS})</th>
        <th>TS-2<br>(${TAHUN.TS2})</th>
        <th>TS-1<br>(${TAHUN.TS1})</th>
        <th>TS<br>(${TAHUN.TS})</th>
        <th>SB</th><th>B</th><th>C</th><th>KB</th>
      </tr>
      <tr style="background:var(--g100);font-size:10px;color:var(--g500);text-align:center">
        <th>1</th><th>2</th>
        <th>3</th><th>4</th><th>5</th><th>6</th><th>7</th>
        <th>8</th><th>9</th><th>10</th>
        <th>11</th><th>12</th><th>13</th><th>14</th>
        <th>15</th><th>16</th>
      </tr>
    </thead>`;

  const rows = JENIS_LIST.map((j, idx) => {
    const no    = idx < 6 ? idx + 1 : '...';
    const jKey  = j.replace(/\s+/g,'_');
    const c     = cfg[jKey] || {};

    // "Pengguna Lulusan" datanya ada di ts_employer
    const isPL = j === 'Pengguna Lulusan';

    // Filter aman: parseInt untuk tahun, trim untuk jenis
    const skByJenis = isPL ? [] : sk.filter(x => x.jenis === j);
    const rTS2 = isPL ? 0 : skByJenis.filter(x => parseInt(x.tahun_survei) === TAHUN.TS2).length;
    const rTS1 = isPL ? 0 : skByJenis.filter(x => parseInt(x.tahun_survei) === TAHUN.TS1).length;
    const rTS  = isPL ? _em.length : skByJenis.filter(x => parseInt(x.tahun_survei) === TAHUN.TS).length;

    const popTS2 = parseInt(c.popTS2 || 0);
    const popTS1 = parseInt(c.popTS1 || 0);
    const popTS  = parseInt(c.popTS  || 0);

    const pct = (r, p) => (p > 0 ? Math.round(r / p * 100) + '%' : '–');

    // Untuk Pengguna Lulusan: gunakan kunci rtg_er1..7 dari ts_employer
    const keys = isPL
      ? ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']
      : ['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7'];

    const grpTS = isPL ? _em : sk.filter(x => x.jenis === j && parseInt(x.tahun_survei) === TAHUN.TS);
    const cnt   = { SB:0, B:0, C:0, K:0 };
    grpTS.forEach(x => {
      const vals = keys.map(k => x[k]).filter(Boolean);
      if (!vals.length) return;
      const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
      if (avg >= 3.5) cnt.SB++; else if (avg >= 2.5) cnt.B++;
      else if (avg >= 1.5) cnt.C++; else cnt.K++;
    });

    const allGrp = isPL ? _em : sk.filter(x => x.jenis === j);
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

  // ── Baris Jumlah
  const totalTS2 = JENIS_LIST.reduce((s,j) => {
    if (j === 'Pengguna Lulusan') return s;
    return s + sk.filter(x => x.jenis === j && parseInt(x.tahun_survei) === TAHUN.TS2).length;
  }, 0);
  const totalTS1 = JENIS_LIST.reduce((s,j) => {
    if (j === 'Pengguna Lulusan') return s;
    return s + sk.filter(x => x.jenis === j && parseInt(x.tahun_survei) === TAHUN.TS1).length;
  }, 0);
  const totalTS = JENIS_LIST.reduce((s,j) => {
    if (j === 'Pengguna Lulusan') return s + _em.length;
    return s + sk.filter(x => x.jenis === j && parseInt(x.tahun_survei) === TAHUN.TS).length;
  }, 0);
  const grandTotal = totalTS2 + totalTS1 + totalTS;

  // Deteksi data yang tidak terhitung (jenis tidak cocok)
  const skTerhitung = sk.filter(x => JENIS_LIST.includes((x.jenis||'').trim())).length;
  const skTidakTerhitung = sk.length - skTerhitung;
  const jenisTidakDikenal = [...new Set(
    sk.filter(x => !JENIS_LIST.includes((x.jenis||'').trim())).map(x => x.jenis||'(kosong)')
  )];

  const jumlahRow = `<tr style="background:var(--g50);font-weight:700;border-top:2px solid var(--navy)">
    <td colspan="2" style="text-align:center;padding:8px">Jumlah</td>
    <td colspan="2"></td>
    <td style="text-align:center">${totalTS2}</td>
    <td style="text-align:center">${totalTS1}</td>
    <td style="text-align:center">${totalTS}</td>
    <td colspan="3"></td>
    <td colspan="4"></td>
    <td style="text-align:center;font-weight:700">${grandTotal}</td>
    <td></td>
  </tr>`;

  const warningHtml = skTidakTerhitung > 0 ? `
    <div class="info-box" style="margin-top:10px;background:#fff3cd;border-color:#ffc107;color:#856404;font-size:12px">
      ⚠️ <strong>${skTidakTerhitung} data stakeholder tidak terhitung</strong> karena nilai kolom <code>jenis</code>
      tidak cocok dengan daftar kategori LKPS.<br>
      Nilai tidak dikenal: <strong>${jenisTidakDikenal.map(j=>`"${j}"`).join(', ')}</strong><br>
      <span style="font-size:11px">Perbaiki nilai <code>jenis</code> di Supabase agar sesuai dengan:
      Mahasiswa, Dosen, Tenaga Kependidikan, Mitra, Lulusan, Pengguna Lulusan, Lainnya</span>
    </div>` : '';

  const keterangan = `<p style="font-size:11px;color:var(--g500);margin-top:10px;font-style:italic">
    <strong>Keterangan:</strong> Skala penilaian responden: SB (Sangat Baik) = 4, B (Baik) = 3, C (Cukup) = 2, K (Kurang) = 1.
    Skor akhir dikonversi ke skala 1–4 sesuai panduan LAM PTIP IAPS 1.0.<br>
    Total terdata: <strong>${sk.length} stakeholder + ${_em.length} pengguna lulusan</strong> = ${sk.length + _em.length} responden.
    ${isSuperAdmin()?'<span style="color:var(--teal)">💡 <strong>Superadmin:</strong> Isi kolom populasi (input kecil di bawah %) dan tindak lanjut. Data tersimpan otomatis di browser.</span>':''}
  </p>`;

  return `<div class="tw" style="overflow-x:auto">
    <table class="dt" style="min-width:900px;font-size:12px">
      ${headerRow}
      <tbody>${rows}${jumlahRow}</tbody>
    </table>
    ${keterangan}
    ${warningHtml}
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

// ════════════════════════════════════════════════════════
//  RENDER PANEL EXPORT EXCEL — tampilkan statistik live
// ════════════════════════════════════════════════════════
async function renderExcelPanel() {
  const panel = document.getElementById('ap-excel');
  if (!panel) return;

  try {
    const { al, em, sk } = await getData();

    // ── Badge jumlah data live
    let infoEl = document.getElementById('excel-panel-stats');
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'excel-panel-stats';
      infoEl.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin:0 28px 20px;';
      const firstCC = panel.querySelector('.cc');
      if (firstCC) firstCC.after(infoEl);
    }
    infoEl.innerHTML = [
      { icon:'👨‍🎓', label:'Alumni',           count: al.length,                color:'#1B7A4A', bg:'#F0FDF4' },
      { icon:'🏢',   label:'Pengguna Lulusan', count: em.length,                color:'#2563EB', bg:'#EFF6FF' },
      { icon:'🤝',   label:'Stakeholder',      count: sk.length,                color:'#B45309', bg:'#FFFBEB' },
      { icon:'📝',   label:'Total Responden',  count: al.length+em.length+sk.length, color:'var(--navy)', bg:'var(--g50)' },
    ].map(d => `
      <div style="background:${d.bg};border:1px solid ${d.color}33;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;min-width:150px">
        <span style="font-size:18px">${d.icon}</span>
        <div>
          <div style="font-size:18px;font-weight:800;color:${d.color}">${d.count}</div>
          <div style="font-size:10.5px;color:var(--g500);font-weight:500">${d.label}</div>
        </div>
      </div>`).join('');

    // ── Tabel debug distribusi Stakeholder (jenis × tahun_survei)
    let dbgEl = document.getElementById('excel-debug-sk');
    if (!dbgEl) {
      dbgEl = document.createElement('div');
      dbgEl.id = 'excel-debug-sk';
      dbgEl.style.cssText = 'margin:0 28px 20px;';
      infoEl.after(dbgEl);
    }
    if (sk.length) {
      // Hitung distribusi per jenis + per tahun
      const dist = {};
      const tahunSet = new Set();
      sk.forEach(x => {
        const j = (x.jenis||'(kosong)').trim();
        const t = x.tahun_survei != null ? parseInt(x.tahun_survei) : '(null)';
        tahunSet.add(t);
        if (!dist[j]) dist[j] = {};
        dist[j][t] = (dist[j][t] || 0) + 1;
      });
      const tahuns = [...tahunSet].sort();
      dbgEl.innerHTML = `
        <details style="background:var(--g50);border:1px solid var(--g200);border-radius:8px;padding:12px 16px">
          <summary style="font-size:12px;font-weight:700;color:var(--navy);cursor:pointer">
            🔍 Debug: Distribusi Data Stakeholder (${sk.length} records) — klik untuk lihat
          </summary>
          <div style="margin-top:12px;overflow-x:auto">
            <table style="border-collapse:collapse;font-size:12px;width:auto">
              <thead>
                <tr style="background:var(--navy);color:#fff">
                  <th style="padding:6px 12px;text-align:left">Jenis Stakeholder</th>
                  ${tahuns.map(t=>`<th style="padding:6px 12px;text-align:center">Tahun ${t}</th>`).join('')}
                  <th style="padding:6px 12px;text-align:center">Total</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(dist).map(([j,tv])=>`
                  <tr style="border-bottom:1px solid var(--g100)">
                    <td style="padding:5px 12px;font-weight:600">${j}</td>
                    ${tahuns.map(t=>`<td style="padding:5px 12px;text-align:center">${tv[t]||0}</td>`).join('')}
                    <td style="padding:5px 12px;text-align:center;font-weight:700">${Object.values(tv).reduce((a,b)=>a+b,0)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <p style="font-size:11px;color:var(--g500);margin-top:8px">
              ⚠️ Pastikan nilai <strong>jenis</strong> di database sesuai persis dengan: Mahasiswa, Dosen, Tenaga Kependidikan, Mitra, Lulusan, Pengguna Lulusan, Lainnya
            </p>
          </div>
        </details>`;
    } else {
      dbgEl.innerHTML = '';
    }
  } catch (e) {
    console.warn('[renderExcelPanel]', e);
  }
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

  // Ambil API key dari user (localStorage via _setAIKey, atau window.GEMINI_API_KEY)
  // TIDAK ADA key hardcoded — supaya tidak ter-leak saat repo public di GitHub.
  const GEMINI_KEY = (window.GEMINI_API_KEY || '').trim();
  if (!GEMINI_KEY) {
    cont.innerHTML = `
      <div class="info-box err">
        <strong>⚠️ API Key Gemini belum diisi</strong><br>
        Masukkan <strong>Gemini API Key</strong> (format: AIzaSy...) pada kolom 🔑 di sebelah kiri tombol Generate.<br>
        <small style="color:var(--g500)">
          Buat API key gratis di
          <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--teal)">aistudio.google.com/apikey</a>.
          Key akan disimpan di browser Anda (localStorage), tidak pernah dikirim ke server manapun selain Google.
        </small>
      </div>`;
    load.style.display = 'none';
    btn.disabled = false;
    txt.textContent = '✨ Generate Narasi AI';
    return;
  }

  // Daftar model stable, urut prioritas. Fallback otomatis kalau gagal kuota/not-found.
  const MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash'
  ];

  const callGemini = async (model) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature     : 0.7,
            maxOutputTokens : 4096,
            // Matikan "thinking" supaya token output dipakai untuk teks, bukan reasoning internal
            thinkingConfig  : { thinkingBudget: 0 }
          }
        })
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(()=>({error:{message:res.statusText}}));
      const msg = errData?.error?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.isQuota = /quota|rate|429|resource_exhausted/i.test(msg) || res.status === 429;
      err.isNotFound = res.status === 404 || /not found|not supported/i.test(msg);
      err.isLeaked = /leaked|reported/i.test(msg);
      err.isAuth = res.status === 401 || res.status === 403;
      err.isOverload = res.status === 503 || res.status === 500 || /overload|unavailable|high demand|try again later/i.test(msg);
      // "Transient" = worth retrying / fallback: overload, quota, not-found
      err.isTransient = err.isOverload || err.isQuota || err.isNotFound;
      throw err;
    }

    const data = await res.json();
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map(p => p.text || '').join('') || '';
    const finish = cand?.finishReason || '';

    if (!text.trim()) {
      const hint = finish === 'MAX_TOKENS'
        ? 'Respon terpotong (MAX_TOKENS). Coba lagi — kadang model habiskan token untuk internal reasoning.'
        : finish === 'SAFETY'
          ? 'Diblokir oleh filter safety Gemini. Coba ubah bahasa prompt.'
          : `Tidak ada teks dikembalikan (finishReason: ${finish || 'unknown'}).`;
      throw new Error(hint);
    }
    return { text, model };
  };

  // Coba setiap model, dengan retry untuk error transient (overload/503)
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let result = null;
  let lastErr = null;

  outer: for (const model of MODELS) {
    // Retry hingga 3x per model untuk error overload (503)
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const suffix = attempt > 1 ? ` (retry ${attempt}/${MAX_RETRIES})` : '';
        txt.textContent = `⏳ ${model}${suffix}...`;
        result = await callGemini(model);
        break outer; // Berhasil — keluar dari semua loop
      } catch (e) {
        lastErr = e;
        console.warn(`[AI] ${model} attempt ${attempt}: ${e.message}`);

        // Auth/leaked error → stop semua, jangan coba model lain
        if (e.isAuth || e.isLeaked) break outer;

        // Error permanen (bukan transient) → langsung coba model berikutnya, tidak retry
        if (!e.isTransient) break; // keluar dari inner loop, lanjut ke model berikutnya

        // Overload & masih ada retry tersisa → tunggu dengan exponential backoff
        if (e.isOverload && attempt < MAX_RETRIES) {
          const delay = 2000 * attempt; // 2s, 4s, 6s
          txt.textContent = `⏳ Server sibuk, tunggu ${delay/1000}s...`;
          await sleep(delay);
          continue; // retry model yang sama
        }

        // Kuota/not-found atau retry habis → break ke model berikutnya
        break;
      }
    }
  }

  if (!result) {
    // Susun pesan error yang informatif
    let title = '⚠️ Gagal generate narasi AI';
    let hint = '';
    if (lastErr?.isLeaked) {
      title = '🔒 API Key telah di-revoke oleh Google';
      hint = `
        Google mendeteksi API key Anda ter-expose di tempat public (misalnya GitHub).
        Sebagai tindakan keamanan, key tersebut otomatis dinonaktifkan.<br><br>
        <strong>Solusi:</strong><br>
        1. Buka <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--teal)">aistudio.google.com/apikey</a><br>
        2. Hapus key lama, buat key baru<br>
        3. Paste key baru di kolom 🔑 Gemini Key di atas<br>
        4. <strong>Jangan</strong> commit key ke repo public`;
    } else if (lastErr?.isOverload) {
      title = '⏳ Server Gemini sedang sibuk (overload)';
      hint = `
        Semua model Gemini sedang mengalami lonjakan permintaan (status 503). Ini bersifat sementara dan di luar kendali aplikasi.<br><br>
        <strong>Solusi:</strong><br>
        • Tunggu <strong>1-5 menit</strong>, lalu klik Generate lagi<br>
        • Coba di waktu yang lebih sepi (pagi/malam WIB)<br>
        • Kalau terus-menerus 503, cek status Google di
          <a href="https://status.cloud.google.com" target="_blank" style="color:var(--teal)">status.cloud.google.com</a>`;
    } else if (lastErr?.isAuth) {
      hint = 'API key tidak valid atau tidak punya akses. Cek lagi key Anda di aistudio.google.com/apikey.';
    } else if (lastErr?.isQuota) {
      hint = 'Kuota harian habis. Tunggu reset besok atau upgrade ke tier berbayar.';
    } else {
      hint = lastErr?.message || 'Unknown error';
    }

    cont.innerHTML = `
      <div class="info-box err">
        <strong>${title}</strong><br>
        ${hint}<br>
        <small style="color:var(--g500);display:block;margin-top:8px">Detail teknis: ${lastErr?.message || '-'}</small>
      </div>`;
    load.style.display = 'none';
    btn.disabled = false;
    txt.textContent = '✨ Generate Narasi AI';
    return;
  }

  // Render markdown sederhana → HTML
  const escapeHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inlineMd = (s) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

  const html = result.text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const h = p.match(/^(#{1,4})\s+(.+)$/);
      if (h) {
        return `<h4 style="margin:18px 0 8px;color:var(--navy,#003D5B);font-weight:700">${inlineMd(h[2])}</h4>`;
      }
      if (/^\*\*[^*]+\*\*\s*:?\s*$/.test(p)) {
        return `<h4 style="margin:18px 0 8px;color:var(--navy,#003D5B);font-weight:700">${inlineMd(p.replace(/\*\*/g,''))}</h4>`;
      }
      if (/^\d+\.\s+[^.]{3,80}$/.test(p)) {
        return `<h4 style="margin:18px 0 8px;color:var(--navy,#003D5B);font-weight:700">${inlineMd(p)}</h4>`;
      }
      return `<p style="margin-bottom:12px;line-height:1.75;text-align:justify">${inlineMd(p.replace(/\n/g,' '))}</p>`;
    })
    .join('');

  cont.innerHTML = html + `
    <p style="font-size:10.5px;color:var(--g500);margin-top:16px;padding-top:10px;border-top:1px dashed var(--g200)">
      <em>✨ Narasi dibuat otomatis oleh Google ${result.model}. Silakan tinjau, edit, dan sesuaikan dengan konteks institusi sebelum dipublikasikan.</em>
    </p>`;

  load.style.display = 'none';
  btn.disabled = false;
  txt.textContent = '✨ Generate Narasi AI';
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
//  EXPORT EXCEL (.xlsx) — Komprehensif Multi-Sheet
//  Sheet: Ringkasan | Data Alumni | Pengguna Lulusan |
//         Stakeholder | Tabel 2.7B | 2.7C | 2.8B1 | 2.8B2
// ════════════════════════════════════════════════════════

// ── Helper: load SheetJS sekali
async function _loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.XLSX;
}

// ── Helper: set style pada range (header row)
function _styleHeader(ws, range, fillHex) {
  const XLSX = window.XLSX;
  if (!XLSX || !ws['!cols']) return;
  // SheetJS CE tidak mendukung style — fungsi ini disiapkan untuk SheetJS Pro / xlsx-style
  // Cukup set column widths saja
}

// ── Helper: set lebar kolom otomatis berdasarkan data
function _autoColWidth(ws, data, headers) {
  const colWidths = headers.map(h => {
    const maxData = Math.max(...data.map(row => String(row[h] || '').length));
    return Math.min(Math.max(h.length, maxData) + 2, 45);
  });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
}

// ── Fungsi export utama — semua data dalam satu workbook
export async function exportExcel() {
  if (!isSuperAdmin()) return alert('Akses ditolak. Hanya superadmin.');

  // Tampilkan progress di tombol
  const btn = document.getElementById('btn-export-excel-all');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Menyiapkan Excel...'; }

  try {
    const XLSX = await _loadXLSX();
    const { al, em, sk } = await getData();

    if (!al.length && !em.length && !sk.length) {
      alert('Belum ada data untuk diekspor.');
      return;
    }

    const wb  = XLSX.utils.book_new();
    const tgl = new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
    const tglFile = new Date().toISOString().slice(0, 10);

    // ── SHEET 1: RINGKASAN EKSEKUTIF ──────────────────────
    const bekerja    = al.filter(a => a.status && !a.status.includes('Belum') && !a.status.includes('Studi')).length;
    const pctKerja   = al.length ? Math.round(bekerja / al.length * 100) : 0;
    const relevan    = al.filter(a => ['Sangat Erat','Erat'].includes(a.kesesuaian)).length;
    const pctRelevan = bekerja ? Math.round(relevan / bekerja * 100) : 0;
    const lt6Al      = al.filter(a => a.tunggu && (a.tunggu.includes('<') || a.tunggu.includes('Kurang dari 6'))).length;
    const pctLt6     = al.length ? Math.round(lt6Al / al.length * 100) : 0;
    const avg7Em     = (() => {
      const keys = ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7'];
      if (!em.length) return '–';
      const tot = em.reduce((s,r) => s + keys.reduce((ss,k) => ss + (r[k]||0), 0), 0);
      return (tot / (em.length * keys.length)).toFixed(2);
    })();
    const avgProdi   = (() => {
      const keys = ['rtg_ar1','rtg_ar2','rtg_ar3','rtg_ar4','rtg_ar5','rtg_ar6','rtg_ar7'];
      if (!al.length) return '–';
      const tot = al.reduce((s,r) => s + keys.reduce((ss,k) => ss + (r[k]||0), 0), 0);
      return (tot / (al.length * keys.length)).toFixed(2);
    })();
    const avgSk      = (() => {
      const keys = ['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7'];
      if (!sk.length) return '–';
      const tot = sk.reduce((s,r) => s + keys.reduce((ss,k) => ss + (r[k]||0), 0), 0);
      return (tot / (sk.length * keys.length)).toFixed(2);
    })();

    const summaryData = [
      ['LAPORAN TRACER STUDY — RINGKASAN EKSEKUTIF', ''],
      ['Program Studi Manajemen Sumber Daya Perairan (MSP)', ''],
      ['Fakultas Perikanan dan Ilmu Kelautan · UNSRAT Manado', ''],
      [`Dicetak: ${tgl}`, ''],
      ['', ''],
      ['INDIKATOR', 'NILAI'],
      ['Total Responden Alumni', al.length],
      ['Total Responden Pengguna Lulusan (Atasan Langsung)', em.length],
      ['Total Responden Stakeholder', sk.length],
      ['', ''],
      ['INDIKATOR LAM PTIP', 'HASIL'],
      ['% Lulusan Bekerja / Berwirausaha', `${pctKerja}%`],
      ['% Kesesuaian Bidang Kerja (Erat + Sangat Erat)', `${pctRelevan}%`],
      ['% Lulusan dengan Waktu Tunggu < 6 Bulan (WT1)', `${pctLt6}%`],
      ['Rata-rata 7 Aspek Kepuasan Pengguna Lulusan (Tabel 2.7B)', `${avg7Em} / 4`],
      ['Rata-rata Penilaian Prodi oleh Alumni', `${avgProdi} / 4`],
      ['Rata-rata Kepuasan Stakeholder (Tabel 2.7C)', `${avgSk} / 4`],
      ['', ''],
      ['DISTRIBUSI STATUS PEKERJAAN ALUMNI', 'JUMLAH'],
      ...Object.entries((() => {
        const m = {}; al.forEach(a => { const v = a.status||'Tidak diisi'; m[v] = (m[v]||0)+1; }); return m;
      })()).map(([k, v]) => [k, v]),
      ['', ''],
      ['DISTRIBUSI BIDANG PEKERJAAN (Top 10)', 'JUMLAH'],
      ...Object.entries((() => {
        const m = {}; al.forEach(a => { const v = (a.bidang||'Tidak diisi').split('(')[0].trim(); m[v]=(m[v]||0)+1; }); return m;
      })()).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([k, v]) => [k, v]),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 55 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, '📊 Ringkasan');

    // ── SHEET 2: DATA ALUMNI LENGKAP ──────────────────────
    if (al.length) {
      const headersAl = [
        'No','Nama','NIM','Thn Masuk','Thn Lulus','Email','No. HP','Gender','IPK',
        'Judul Skripsi','Status Pekerjaan','Waktu Tunggu','Instansi/Perusahaan',
        'Jabatan','Kota','Bidang/Sektor','Level Tempat Kerja','Gaji/Penghasilan',
        'Kesesuaian Bidang','Sumber Informasi Kerja','Kompetensi Perlu Ditingkatkan',
        'Rekomendasi Prodi',
        'AR1 - Kurikulum','AR2 - Pengajaran','AR3 - Bimbingan',
        'AR4 - Lab Perairan','AR5 - Sarana Kampus','AR6 - PKL/Lapangan','AR7 - Adm Akademik',
        'Metode Pembelajaran','Saran Kurikulum','Saran Fasilitas','Pesan',
        'Tanggal Isi',
      ];
      const rowsAl = al.map((a, i) => [
        i+1, a.nama||'', a.nim||'', a.masuk||'', a.lulus||'',
        a.email||'', a.hp||'', a.gender||'', a.ipk||'', a.judul||'',
        a.status||'', a.tunggu||'', a.instansi||'', a.jabatan||'', a.kota||'',
        a.bidang||'', a.level_kerja||'', a.gaji||'', a.kesesuaian||'',
        a.sumber||'', a.kompetensi||'', a.rekomendasi||'',
        a.rtg_ar1||'', a.rtg_ar2||'', a.rtg_ar3||'', a.rtg_ar4||'',
        a.rtg_ar5||'', a.rtg_ar6||'', a.rtg_ar7||'',
        a.metode||'', a.saran_kur||'', a.saran_fas||'', a.pesan||'',
        new Date(a.created_at).toLocaleString('id-ID'),
      ]);
      const wsAl = XLSX.utils.aoa_to_sheet([headersAl, ...rowsAl]);
      wsAl['!cols'] = headersAl.map((h, i) => ({
        wch: [4,22,14,10,10,24,14,8,6,32,22,16,26,18,14,26,22,18,16,22,32,14,
              6,6,6,6,6,6,6,20,32,32,32,18][i] || 14
      }));
      XLSX.utils.book_append_sheet(wb, wsAl, '👨‍🎓 Data Alumni');
    }

    // ── SHEET 3: DATA PENGGUNA LULUSAN ────────────────────
    if (em.length) {
      const headersEm = [
        'No','Instansi/Perusahaan','Sektor','Kota','Nama Pengisi','Jabatan Pengisi',
        'Email','No. Telp','Nama Alumni','Jabatan Alumni','Lama Bekerja',
        'ER1 - Integritas','ER2 - Keahlian Bidang','ER3 - Bahasa Asing',
        'ER4 - Teknologi Info','ER5 - Komunikasi','ER6 - Kerjasama Tim','ER7 - Pengembangan Diri',
        'Rata-rata 7 Aspek','Tingkat Kepuasan','Bersedia Rekrut Lagi',
        'Saran','Pesan','Tanggal Isi',
      ];
      const rowsEm = em.map((e, i) => {
        const rtgVals = [e.rtg_er1,e.rtg_er2,e.rtg_er3,e.rtg_er4,e.rtg_er5,e.rtg_er6,e.rtg_er7].filter(Boolean);
        const avgRtg  = rtgVals.length ? (rtgVals.reduce((a,b)=>a+b,0)/rtgVals.length).toFixed(2) : '';
        return [
          i+1, e.instansi||'', e.sektor||'', e.kota||'', e.pengisi||'', e.jab_pengisi||'',
          e.email||'', e.telp||'', e.alumni_nama||'', e.alumni_jab||'', e.lama||'',
          e.rtg_er1||'', e.rtg_er2||'', e.rtg_er3||'', e.rtg_er4||'',
          e.rtg_er5||'', e.rtg_er6||'', e.rtg_er7||'', avgRtg,
          e.kepuasan||'', e.rekrut||'', e.saran||'', e.pesan||'',
          new Date(e.created_at).toLocaleString('id-ID'),
        ];
      });
      const wsEm = XLSX.utils.aoa_to_sheet([headersEm, ...rowsEm]);
      wsEm['!cols'] = headersEm.map((h, i) => ({
        wch: [4,28,16,14,20,20,24,14,20,18,14,
              6,6,6,6,6,6,6,12,18,16,32,32,18][i] || 14
      }));
      XLSX.utils.book_append_sheet(wb, wsEm, '🏢 Pengguna Lulusan');
    }

    // ── SHEET 4: DATA STAKEHOLDER ─────────────────────────
    if (sk.length) {
      const headersSk = [
        'No','Tahun Survei','Jenis Stakeholder','Nama','Instansi','Email',
        'SK1 - Pengajaran','SK2 - Kurikulum','SK3 - Fasilitas',
        'SK4 - Pelayanan Akademik','SK5 - Kompetensi SDM','SK6 - Suasana Akademik','SK7 - Kerjasama',
        'Rata-rata 7 Aspek','Tingkat Kepuasan','Saran','Harapan','Tanggal Isi',
      ];
      const rowsSk = sk.map((s, i) => {
        const rtgVals = [s.rtg_sk1,s.rtg_sk2,s.rtg_sk3,s.rtg_sk4,s.rtg_sk5,s.rtg_sk6,s.rtg_sk7].filter(Boolean);
        const avgRtg  = rtgVals.length ? (rtgVals.reduce((a,b)=>a+b,0)/rtgVals.length).toFixed(2) : '';
        return [
          i+1, s.tahun_survei||'', s.jenis||'', s.nama||'', s.instansi||'', s.email||'',
          s.rtg_sk1||'', s.rtg_sk2||'', s.rtg_sk3||'', s.rtg_sk4||'',
          s.rtg_sk5||'', s.rtg_sk6||'', s.rtg_sk7||'', avgRtg,
          s.kepuasan||'', s.saran||'', s.harapan||'',
          new Date(s.created_at).toLocaleString('id-ID'),
        ];
      });
      const wsSk = XLSX.utils.aoa_to_sheet([headersSk, ...rowsSk]);
      wsSk['!cols'] = headersSk.map((h, i) => ({
        wch: [4,12,20,22,26,24,6,6,6,6,6,6,6,12,18,32,32,18][i] || 14
      }));
      XLSX.utils.book_append_sheet(wb, wsSk, '🤝 Stakeholder');
    }

    // ── SHEET 5: TABEL 2.7B — KEPUASAN PENGGUNA LULUSAN ──
    {
      const totalEm27b = em.length || 1;
      const header27b = [
        ['TABEL 2.7B — KEPUASAN PENGGUNA LULUSAN (LAM PTIP IAPS 1.0)', '', '', '', '', '', '', ''],
        [`Program Studi MSP FPIK UNSRAT · Jumlah Responden: ${em.length} · Dicetak: ${tgl}`, '', '', '', '', '', '', ''],
        [`Satuan: % dari total responden (${em.length} pengguna lulusan)`, '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['No', 'Jenis Kemampuan', 'Sangat Baik (%)', 'Baik (%)', 'Cukup (%)', 'Kurang (%)', 'Jumlah % Kepuasan (SB+B)', 'Rencana Tindak Lanjut UPPS/PS'],
        ['1', '2', '3', '4', '5', '6', '7', '8'],
      ];
      const rows27b = ASPEK_LAM.map((r, i) => {
        const k  = `rtg_er${i+1}`;
        const vs = em.map(e=>e[k]).filter(Boolean);
        const cnt= {4:0,3:0,2:0,1:0};
        vs.forEach(v=>{const c=v>=4?4:v>=3?3:v>=2?2:1;cnt[c]++;});
        const pct = cat => vs.length ? parseFloat((cnt[cat]/totalEm27b*100).toFixed(2)) : 0;
        const jumlahPct = vs.length ? parseFloat(((cnt[4]+cnt[3])/totalEm27b*100).toFixed(2)) : 0;
        return [i+1, r.lbl, pct(4), pct(3), pct(2), pct(1), jumlahPct, ''];
      });
      const jumlahRow = ['', 'Jumlah',
        ...[4,3,2,1].map(cat =>
          parseFloat(ASPEK_LAM.reduce((s,_,i)=>{
            const k=`rtg_er${i+1}`;const vs=em.map(e=>e[k]).filter(Boolean);
            const cnt={4:0,3:0,2:0,1:0};vs.forEach(v=>{const c=v>=4?4:v>=3?3:v>=2?2:1;cnt[c]++;});
            return s+(vs.length?cnt[cat]/totalEm27b*100:0);
          },0).toFixed(2))
        ),
        parseFloat(ASPEK_LAM.reduce((s,_,i)=>{
          const k=`rtg_er${i+1}`;const vs=em.map(e=>e[k]).filter(Boolean);
          const cnt={4:0,3:0};vs.forEach(v=>{if(v>=4)cnt[4]++;else if(v>=3)cnt[3]++;});
          return s+(vs.length?(cnt[4]+cnt[3])/totalEm27b*100:0);
        },0).toFixed(2)),
        ''
      ];
      const ws27b = XLSX.utils.aoa_to_sheet([...header27b, ...rows27b, jumlahRow]);
      ws27b['!cols'] = [{ wch:4 }, { wch:38 }, { wch:14 }, { wch:10 }, { wch:10 }, { wch:10 }, { wch:22 }, { wch:32 }];
      XLSX.utils.book_append_sheet(wb, ws27b, '2.7B Kepuasan Pengguna');
    }

    // ── SHEET 6: TABEL 2.7C — KEPUASAN STAKEHOLDER ───────
    if (sk.length || em.length) {
      const JENIS_LIST_27C = ['Mahasiswa','Dosen','Tenaga Kependidikan','Mitra','Lulusan','Pengguna Lulusan','Lainnya'];
      const cfg27c = (() => { try { return JSON.parse(localStorage.getItem('sk_27c_config')||'{}'); } catch { return {}; } })();
      const header27c = [
        ['TABEL 2.7C — KEPUASAN STAKEHOLDER INTERNAL DAN EKSTERNAL (LAM PTIP IAPS 1.0)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Diisi oleh pengusul dari Program Studi pada semua program', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        [`Program Studi MSP FPIK UNSRAT · Dicetak: ${tgl}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        // Header baris 1
        ['No', 'Stakeholder',
         'Instrumen', '',
         'Jumlah Responden', '', '',
         'Persentase Keterwakilan Responden', '', '',
         'Jumlah Responden yang menjawab layanan (SB=4, B=3, C=2, K=1)', '', '', '',
         'Skor', 'Tindak Lanjut'],
        // Header baris 2 (sub-kolom)
        ['', '',
         'Ada', 'Tidak Ada',
         `TS-2 (${TAHUN_SURVEI.TS_2})`, `TS-1 (${TAHUN_SURVEI.TS_1})`, `TS (${TAHUN_SURVEI.TS})`,
         `TS-2 (${TAHUN_SURVEI.TS_2})`, `TS-1 (${TAHUN_SURVEI.TS_1})`, `TS (${TAHUN_SURVEI.TS})`,
         'SB', 'B', 'C', 'KB',
         '', ''],
        // Nomor kolom sesuai LKPS
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'],
      ];
      const rows27c = JENIS_LIST_27C.map((j, idx) => {
        const isPL  = j === 'Pengguna Lulusan';
        const jKey  = j.replace(/\s+/g,'_');
        const c     = cfg27c[jKey] || {};

        const rTS2  = isPL ? 0 : sk.filter(x => x.jenis === j && parseInt(x.tahun_survei) === TAHUN_SURVEI.TS_2).length;
        const rTS1  = isPL ? 0 : sk.filter(x => x.jenis === j && parseInt(x.tahun_survei) === TAHUN_SURVEI.TS_1).length;
        const rTS   = isPL ? em.length : sk.filter(x => x.jenis === j && parseInt(x.tahun_survei) === TAHUN_SURVEI.TS).length;

        const popTS2 = parseInt(c.popTS2 || 0);
        const popTS1 = parseInt(c.popTS1 || 0);
        const popTS  = parseInt(c.popTS  || 0);
        const pctFmt = (r, p) => p > 0 ? parseFloat((r/p*100).toFixed(1)) : '';

        const instrAda   = c.instrAda === '1' ? '✓ Ada' : c.instrAda === '0' ? '' : '';
        const instrTidak = c.instrAda === '0' ? '✓ Tidak Ada' : '';

        const keys  = isPL
          ? ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']
          : ['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7'];
        const grpTS = isPL ? em : sk.filter(x => x.jenis === j && parseInt(x.tahun_survei) === TAHUN_SURVEI.TS);
        const cnt   = { SB:0, B:0, C:0, K:0 };
        grpTS.forEach(x => {
          const vals = keys.map(k => x[k]).filter(Boolean);
          if (!vals.length) return;
          const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
          if (avg >= 3.5) cnt.SB++; else if (avg >= 2.5) cnt.B++; else if (avg >= 1.5) cnt.C++; else cnt.K++;
        });
        const allGrp = isPL ? em : sk.filter(x => x.jenis === j);
        let skor = '';
        if (allGrp.length) {
          const tot = allGrp.reduce((s, x) => {
            const vals = keys.map(k => x[k]).filter(Boolean);
            return s + (vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0);
          }, 0);
          skor = parseFloat((tot / allGrp.length).toFixed(2));
        }
        return [
          idx+1, j,
          instrAda, instrTidak,
          rTS2||0, rTS1||0, rTS||0,
          pctFmt(rTS2, popTS2), pctFmt(rTS1, popTS1), pctFmt(rTS, popTS),
          cnt.SB||0, cnt.B||0, cnt.C||0, cnt.K||0,
          skor,
          c.tindak || '',
        ];
      });
      const jumlahRow27c = (() => {
        const totTS2 = JENIS_LIST_27C.reduce((s,j) => j==='Pengguna Lulusan'?s:s+sk.filter(x=>x.jenis===j&&parseInt(x.tahun_survei)===TAHUN_SURVEI.TS_2).length, 0);
        const totTS1 = JENIS_LIST_27C.reduce((s,j) => j==='Pengguna Lulusan'?s:s+sk.filter(x=>x.jenis===j&&parseInt(x.tahun_survei)===TAHUN_SURVEI.TS_1).length, 0);
        const totTS  = JENIS_LIST_27C.reduce((s,j) => j==='Pengguna Lulusan'?s+em.length:s+sk.filter(x=>x.jenis===j&&parseInt(x.tahun_survei)===TAHUN_SURVEI.TS).length, 0);
        return ['Jumlah', '', '', '', totTS2, totTS1, totTS, '', '', '', '', '', '', '', '', ''];
      })();

      // Warning baris data tidak terhitung
      const skTdk = sk.filter(x => !JENIS_LIST_27C.includes((x.jenis||'').trim()));
      const warningRow27c = skTdk.length > 0
        ? [[''], [`⚠️ ${skTdk.length} data stakeholder tidak terhitung (nilai jenis tidak cocok): ${[...new Set(skTdk.map(x=>x.jenis||'(kosong)'))].join(', ')}`]]
        : [];

      const ws27c = XLSX.utils.aoa_to_sheet([...header27c, ...rows27c, jumlahRow27c, ...warningRow27c]);
      ws27c['!cols'] = [
        {wch:4},{wch:22},
        {wch:10},{wch:12},
        {wch:10},{wch:10},{wch:10},
        {wch:10},{wch:10},{wch:10},
        {wch:6},{wch:6},{wch:6},{wch:6},
        {wch:8},{wch:32}
      ];
      XLSX.utils.book_append_sheet(wb, ws27c, '2.7C Kepuasan Stakeholder');
    }

    // ── SHEET 7: TABEL 2.8B1 — WAKTU TUNGGU (per tahun lulus) ──
    {
      const { rows: r81, tot: t81 } = build28B1Data(al);
      const header28b1 = [
        ['TABEL 2.8B1 — WAKTU TUNGGU MENDAPATKAN PEKERJAAN (LAM PTIP IAPS 1.0)', '', '', '', '', ''],
        ['Diisi oleh pengusul dari Program Studi pada Program Sarjana/Sarjana Terapan/Sarjana PJJ', '', '', '', '', ''],
        [`Program Studi MSP FPIK UNSRAT · Dicetak: ${tgl}`, '', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['Tahun Lulus', 'Jumlah Lulusan', 'Jumlah Lulusan yang Terlacak',
         'WT < 6 bulan', '6 ≤ WT ≤ 18 bulan', 'WT > 18 bulan'],
        ['1', '2', '3', '4', '5', '6'],
      ];
      const rows28b1 = [
        ...r81.map(r => [r.label, r.jumlah||0, r.terlacak||0, r.lt6||0, r.mid||0, r.gt18||0]),
        ['Jumlah', t81.jumlah||0, t81.terlacak||0, t81.lt6||0, t81.mid||0, t81.gt18||0],
      ];
      const ws28b1 = XLSX.utils.aoa_to_sheet([...header28b1, ...rows28b1]);
      ws28b1['!cols'] = [{wch:14},{wch:16},{wch:22},{wch:14},{wch:18},{wch:14}];
      XLSX.utils.book_append_sheet(wb, ws28b1, '2.8B1 Waktu Tunggu');
    }

    // ── SHEET 8: TABEL 2.8B2 — TINGKAT TEMPAT KERJA (per tahun lulus) ──
    {
      const { rows: r28, tot: t28 } = build28B2Data(al);
      const header28b2 = [
        ['TABEL 2.8B2 — TEMPAT KERJA / BERWIRAUSAHA (LAM PTIP IAPS 1.0)', '', '', '', '', ''],
        ['Diisi oleh pengusul status Terakreditasi UNGGUL pada program Diploma Tiga/Sarjana/Sarjana Terapan/Sarjana PJJ', '', '', '', '', ''],
        [`Program Studi MSP FPIK UNSRAT · Dicetak: ${tgl}`, '', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['Tahun Lulus', 'Jumlah Lulusan', 'Jumlah Lulusan yang Terlacak',
         'Lokal/Wilayah/Berwirausaha tidak Berbadan Hukum',
         'Nasional/Berwirausaha Berbadan Hukum',
         'Multinasional/Internasional'],
        ['1', '2', '3', '4', '5', '6'],
      ];
      const rows28b2 = [
        ...r28.map(r => [r.label, r.jumlah||0, r.terlacak||0, r.lok||0, r.nas||0, r.mul||0]),
        ['Jumlah', t28.jumlah||0, t28.terlacak||0, t28.lok||0, t28.nas||0, t28.mul||0],
      ];
      const ws28b2 = XLSX.utils.aoa_to_sheet([...header28b2, ...rows28b2]);
      ws28b2['!cols'] = [{wch:14},{wch:16},{wch:22},{wch:36},{wch:32},{wch:22}];
      XLSX.utils.book_append_sheet(wb, ws28b2, '2.8B2 Tempat Kerja');
    }

    // ── SHEET 9: PENILAIAN PRODI OLEH ALUMNI ─────────────
    if (al.length) {
      const headerProdi = [
        ['PENILAIAN PROGRAM STUDI OLEH ALUMNI', '', '', '', '', '', ''],
        [`Program Studi MSP FPIK UNSRAT · Jumlah Responden: ${al.length} · Dicetak: ${tgl}`, '', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['No', 'Aspek Penilaian Prodi (7 Aspek)', 'Sangat Baik (4)', 'Baik (3)', 'Cukup (2)', 'Kurang (1)', 'Rata-rata'],
      ];
      const rowsProdi = ASPEK_PRODI.map((r, i) => {
        const k  = `rtg_ar${i+1}`;
        const vs = al.map(a => a[k]).filter(Boolean);
        const avg = vs.length ? (vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2) : '-';
        const cnt = { 4:0, 3:0, 2:0, 1:0 };
        vs.forEach(v => { const cat = v>=4?4:v>=3?3:v>=2?2:1; cnt[cat]++; });
        return [i+1, r.lbl, cnt[4], cnt[3], cnt[2], cnt[1], parseFloat(avg)||0];
      });
      const wsProdi = XLSX.utils.aoa_to_sheet([...headerProdi, ...rowsProdi]);
      wsProdi['!cols'] = [{wch:4},{wch:50},{wch:14},{wch:10},{wch:10},{wch:10},{wch:12}];
      XLSX.utils.book_append_sheet(wb, wsProdi, '⭐ Penilaian Prodi');
    }

    // ── SHEET 10: PIVOT — BIDANG KERJA × GENDER ──────────
    if (al.length) {
      const bidangMap = {};
      al.forEach(a => {
        const b = (a.bidang||'Tidak diisi').split('(')[0].trim().substring(0, 40);
        const g = a.gender || 'Tidak diisi';
        if (!bidangMap[b]) bidangMap[b] = { 'Laki-laki':0, 'Perempuan':0, 'Tidak diisi':0 };
        bidangMap[b][g] = (bidangMap[b][g]||0) + 1;
      });
      const headerPivot = [
        ['PIVOT — DISTRIBUSI BIDANG KERJA PER GENDER', '', '', ''],
        [`Program Studi MSP FPIK UNSRAT · Dicetak: ${tgl}`, '', '', ''],
        ['', '', '', ''],
        ['Bidang / Sektor Pekerjaan', 'Laki-laki', 'Perempuan', 'Total'],
      ];
      const rowsPivot = Object.entries(bidangMap)
        .sort((a,b) => (b[1]['Laki-laki']+b[1]['Perempuan']) - (a[1]['Laki-laki']+a[1]['Perempuan']))
        .map(([b, g]) => [b, g['Laki-laki']||0, g['Perempuan']||0, (g['Laki-laki']||0)+(g['Perempuan']||0)]);
      const wsPivot = XLSX.utils.aoa_to_sheet([...headerPivot, ...rowsPivot]);
      wsPivot['!cols'] = [{wch:44},{wch:12},{wch:12},{wch:10}];
      XLSX.utils.book_append_sheet(wb, wsPivot, '🔀 Pivot Bidang-Gender');
    }

    // ── Simpan workbook ───────────────────────────────────
    XLSX.writeFile(wb, `LaporanLengkap_TracerStudy_MSP_FPIK_UNSRAT_${tglFile}.xlsx`);

    // Feedback sukses
    if (btn) {
      btn.innerHTML = '✅ Berhasil Diunduh!';
      setTimeout(() => { btn.disabled = false; btn.innerHTML = origText; }, 2500);
    }

  } catch (err) {
    console.error('[exportExcel]', err);
    alert(`Gagal membuat Excel: ${err.message}`);
    if (btn) { btn.disabled = false; btn.innerHTML = origText; }
  }
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
