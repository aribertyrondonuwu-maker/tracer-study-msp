// ══════════════════════════════════════════════════════════
//  admin.js — Dashboard Admin
//  Superadmin : semua tab (Ringkasan, LAM, Analisis, Data Alumni,
//               Data Pengguna Lulusan, Kelola Admin)
//  Admin      : HANYA tab Analisis & Pembahasan
// ══════════════════════════════════════════════════════════

import { db }       from './db.js';
import { TBL_ALUMNI, TBL_EMPLOYER, TBL_ADMINS, TBL_STAKEHOLDER, TBL_CONFIG,
         ASPEK_LAM, ASPEK_PRODI, CHART_COLORS,
         TAB_ACCESS, ROLE, TAHUN_SURVEI, LKPS_COHORTS, DATA_AKADEMIK } from './config.js';
import { getUser, isSuperAdmin, isLoggedIn } from './auth.js';
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
  // Satukan variasi nama jenis dari versi formulir lama ke nilai formulir sekarang,
  // supaya data lama tetap terhitung di Tabel 2.7C.
  // (Formulir MSP menyimpan: Mahasiswa, Dosen, Tenaga Kependidikan, Mitra, Lulusan,
  //  Pengguna Lulusan, Lainnya — nilai lama ber-akhiran "Aktif" ikut dipetakan.)
  const JENIS_NORM = {
    'mahasiswa aktif'           : 'Mahasiswa',
    'dosen aktif'               : 'Dosen',
    'tenaga kependidikan aktif' : 'Tenaga Kependidikan',
    'lulusan / alumni'          : 'Lulusan',
    'alumni'                    : 'Lulusan',
    'mitra / instansi mitra'    : 'Mitra',
  };
  const skNorm = (sk || []).map(x => {
    const raw = (x.jenis || '').trim();
    return { ...x, jenis: JENIS_NORM[raw.toLowerCase()] || raw,
             tahun_survei: x.tahun_survei != null ? parseInt(x.tahun_survei) : null };
  });
  _cache = { al: al || [], em: em || [], sk: skNorm, ts: Date.now() };
  return _cache;
}

// Status bekerja alumni. Formulir MSP tidak lagi menanyakan "status" — responden yang
// mengisi waktu tunggu kerja dianggap sudah bekerja (data lama yang punya kolom status
// tetap dibaca dari kolom status).
function isBekerja(a) {
  const st = (a.status || '').trim();
  if (st) return !st.includes('Belum') && !st.includes('Studi');
  const t = (a.tunggu || '').trim().toLowerCase();
  return !!t && !t.includes('belum pernah bekerja');
}

export function clearCache() { _cache = { al: null, em: null, sk: null, ts: null }; }

// ════════════════════════════════════════════════════════
//  RINGKASAN (Superadmin only)
// ════════════════════════════════════════════════════════
async function renderOverview() {
  const { al, em } = await getData();
  const bekerja    = al.filter(isBekerja).length;
  const pctKerja   = al.length ? Math.round(bekerja / al.length * 100) : 0;
  const relevan    = al.filter(a => ['Sangat Erat','Erat'].includes(a.kesesuaian)).length;
  const pctRelevan = bekerja ? Math.round(relevan / bekerja * 100) : 0;
  const avg7       = avgRtg(em, ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
  const avgProdi   = avgRtg(al, ['rtg_ar1','rtg_ar2','rtg_ar3','rtg_ar4','rtg_ar5','rtg_ar6','rtg_ar7']);

  document.getElementById('sgrid').innerHTML = `
    <div class="sc"><div class="sl">Respons Alumni</div><div class="sv">${al.length}</div></div>
    <div class="sc"><div class="sl">Respons Instansi</div><div class="sv">${em.length}</div></div>
    <div class="sc"><div class="sl">% Lulusan Bekerja</div><div class="sv">${pctKerja}<span class="su">%</span></div></div>
    <div class="sc"><div class="sl">% Kerja Relevan</div><div class="sv">${pctRelevan}<span class="su">%</span></div></div>
    <div class="sc"><div class="sl">Rata-rata 7 Aspek LAM</div><div class="sv">${avg7}<span class="su">/4</span></div></div>
    <div class="sc"><div class="sl">Rata-rata Penilaian Prodi</div><div class="sv">${avgProdi}<span class="su">/4</span></div></div>`;

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
}

// ════════════════════════════════════════════════════════
//  LAPORAN LAM PTIP — Tabel 2.7B, 2.7C, 2.8B1, 2.8B2
//  Format persis mengikuti template resmi LKPS LAM PTIP IAPS 1.0
//  (kohort lulusan TS-4 / TS-3 / TS-2)
// ════════════════════════════════════════════════════════

// ── Util pencocokan nama & kategori ──
function _norm(s) { return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' '); }

function matchAlumniLulusTahun(em, alList) {
  const byName = {};
  alList.forEach(a => { if (a.nama) byName[_norm(a.nama)] = a.lulus ? parseInt(a.lulus) : null; });
  return em.map(e => {
    // Prioritas 1: kolom "Tahun Alumni" (alumni_tahun_lulus) — diisi atasan di formulir
    //              atau dilengkapi superadmin pada tabel Data Pengguna Lulusan
    // Prioritas 2 (cadangan): pencocokan otomatis lewat nama alumni ke tabel Data Alumni (data lama)
    const raw     = e.alumni_tahun_lulus ?? e.alumni_lulus_tahun;
    const manual  = raw ? parseInt(raw) : null;
    const viaName = e.alumni_nama ? (byName[_norm(e.alumni_nama)] ?? null) : null;
    return { ...e, _lulusTahun: manual ?? viaName ?? null };
  });
}

function wtBucket(t) {
  if (!t) return null;
  const s = t.toLowerCase();
  if (s.includes('belum pernah bekerja')) return null;          // belum bekerja → tidak masuk kategori WT
  if (t.includes('< 6') || t.includes('<6') || s.includes('kurang dari 6') ||
      s.includes('sudah bekerja sebelum lulus')) return 'lt6';  // bekerja sebelum lulus = WT < 6 bulan
  if (t.includes('> 18') || t.includes('>18')) return 'gt18';
  return 'mid'; // 6–12 atau 12–18 bulan
}

function levelBucket(lv) {
  if (!lv) return null;
  const s = lv.toLowerCase();
  if (s.includes('multinasional') || s.includes('internasional')) return 'multi';
  if (s.includes('nasional')) return 'nas';
  if (s.includes('lokal')) return 'lok';
  return null;
}

// ── Konfigurasi "Jumlah Lulusan" per kohort (input manual — data institusi,
//    bukan jumlah responden survei, sehingga tidak bisa dihitung otomatis).
//    MSP: disimpan di Supabase (tabel ts_config) supaya sama di semua perangkat.
//    Selama belum diubah, memakai DATA_AKADEMIK.jumlah_lulusan di config.js.
const LKPS_CFG_KEY = 'lkps_jumlah_lulusan';
let _lkpsCfgCache = null;
function lkpsDefaultCfg() {
  const d = {};
  LKPS_COHORTS.forEach(c => {
    const v = DATA_AKADEMIK?.jumlah_lulusan?.[c.year];
    if (v) d[c.key + '_lulus'] = String(v);
  });
  return d;
}
function getLkpsCfg() {
  let saved = _lkpsCfgCache;
  if (saved === null) { try { saved = JSON.parse(localStorage.getItem(LKPS_CFG_KEY) || '{}'); } catch { saved = {}; } }
  return { ...lkpsDefaultCfg(), ...saved };
}
async function loadLkpsCfg() {
  try {
    const { data, error } = await db.from(TBL_CONFIG).select('value').eq('key', LKPS_CFG_KEY).maybeSingle();
    if (error) throw error;
    const v = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : {};
    _lkpsCfgCache = (v && typeof v === 'object') ? v : {};
  } catch (e) {
    console.error('Gagal memuat Jumlah Lulusan LKPS:', e);
    try { _lkpsCfgCache = JSON.parse(localStorage.getItem(LKPS_CFG_KEY) || '{}'); } catch { _lkpsCfgCache = {}; }
  }
  return _lkpsCfgCache;
}
async function saveLkpsCfg(saved) {
  _lkpsCfgCache = saved;
  try { localStorage.setItem(LKPS_CFG_KEY, JSON.stringify(saved)); } catch {}
  const { error } = await db.from(TBL_CONFIG).upsert({ key: LKPS_CFG_KEY, value: saved }, { onConflict: 'key' });
  if (error) alert(`⚠️ Gagal menyimpan Jumlah Lulusan ke database: ${error.message}\nData hanya tersimpan sementara di browser ini.`);
}
window._saveLkpsJumlah = async function (key, value) {
  if (!isSuperAdmin()) return;
  const saved = { ...(_lkpsCfgCache || {}) };
  saved[key] = value;
  await saveLkpsCfg(saved);
  renderLAM();
};

// ── Rencana Tindak Lanjut per aspek Tabel 2.7B (editable superadmin).
//    MSP: disimpan di Supabase ts_config (key "rtl_27b") — isian yang sudah ada tetap dipakai.
const LKPS_RTL_KEY = 'rtl_27b';
const DEFAULT_RTL_27B = [
  'Mempertahankan pembinaan karakter dan etika melalui mata kuliah etika profesi dan kegiatan kemahasiswaan',
  'Memperkuat kurikulum berbasis kompetensi dan memperbanyak praktik lapangan/magang di instansi pengelolaan sumber daya perairan',
  'Meningkatkan kemampuan bahasa Inggris melalui pelatihan TOEFL, penggunaan referensi dan presentasi berbahasa Inggris dalam perkuliahan',
  'Memperkuat pembelajaran berbasis TI, termasuk perangkat lunak analisis data dan SIG untuk pengelolaan sumber daya perairan',
  'Memperbanyak kegiatan presentasi, seminar mahasiswa, dan pelatihan public speaking',
  'Mempertahankan kegiatan berbasis tim seperti proyek kelompok, praktik lapangan, dan organisasi kemahasiswaan',
  'Memperbanyak pelatihan soft skill, workshop pengembangan karier, dan program mentoring bersama alumni',
];
let _rtlCache = null;
function getLkpsRtl() {
  const v = _rtlCache;
  return Array.isArray(v) && v.length === 7 ? v.slice() : DEFAULT_RTL_27B.slice();
}
async function loadLkpsRtl() {
  try {
    const { data, error } = await db.from(TBL_CONFIG).select('value').eq('key', LKPS_RTL_KEY).maybeSingle();
    if (error) throw error;
    const val = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : null;
    _rtlCache = Array.isArray(val) && val.length === 7 ? val : DEFAULT_RTL_27B.slice();
  } catch (e) {
    console.error('Gagal memuat Rencana Tindak Lanjut 2.7B:', e);
    try { _rtlCache = JSON.parse(localStorage.getItem(LKPS_RTL_KEY) || 'null') || DEFAULT_RTL_27B.slice(); }
    catch { _rtlCache = DEFAULT_RTL_27B.slice(); }
  }
  return _rtlCache;
}
window._saveLkpsRtl = async function (idx, val) {
  if (!isSuperAdmin()) return;
  const arr = getLkpsRtl();
  arr[idx] = val;
  _rtlCache = arr;
  try { localStorage.setItem(LKPS_RTL_KEY, JSON.stringify(arr)); } catch {}
  const { error } = await db.from(TBL_CONFIG).upsert({ key: LKPS_RTL_KEY, value: arr }, { onConflict: 'key' });
  if (error) alert(`⚠️ Gagal menyimpan Rencana Tindak Lanjut ke database: ${error.message}\nData hanya tersimpan sementara di browser ini.`);
};

// ── Muat semua konfigurasi LKPS dari database sebelum tabel dihitung
async function loadAllLkpsConfig() {
  await Promise.all([loadLkpsCfg(), loadLkpsRtl(), loadSkConfig()]);
}

// ── Persentase 1 desimal yang dijamin berjumlah tepat 100,0%
//    (metode sisa terbesar), supaya kolom 7 = SUM(kolom 3 s.d. 6) tidak jadi 99,9%/100,1%.
function pct1Desimal(counts, total) {
  if (!total) return counts.map(() => 0);
  const raw    = counts.map(c => c * 1000 / total);          // dalam satuan 0,1%
  const bawah  = raw.map(Math.floor);
  let sisa     = 1000 - bawah.reduce((s, v) => s + v, 0);
  raw.map((v, i) => ({ i, frac: v - bawah[i] }))
     .sort((a, b) => b.frac - a.frac)
     .forEach(o => { if (sisa > 0 && o.frac > 0) { bawah[o.i]++; sisa--; } });
  return bawah.map(v => v / 10);
}
const round1 = v => Math.round(v * 10) / 10;

// ── Perhitungan Tabel 2.7B (dua bagian sesuai format resmi)
//    Mengikuti rumus template LKPS LAM PTIP IAPS 1.0 (sheet 2.7B):
//    • Kolom 7 tiap aspek  = SUM(Sangat Baik : Kurang)          → G22 = SUM(C22:F22)
//    • Baris Jumlah kol 3–6 = SUM ketujuh aspek per kolom         → C29 = SUM(C22:C28)
//    • Baris Jumlah kol 7   = kosong (template tidak berisi rumus di G29)
function compute27B(em, alList) {
  const emY  = matchAlumniLulusTahun(em, alList);
  const rtl  = getLkpsRtl();
  const cfg  = getLkpsCfg();

  const partA = LKPS_COHORTS.map(c => ({
    ...c,
    jumlahLulusan: cfg[c.key + '_lulus'] || '',
    tanggapan: emY.filter(e => e._lulusTahun === c.year).length,
  }));
  const totalTanggapan = partA.reduce((s, r) => s + r.tanggapan, 0);
  const totalLulusan   = partA.reduce((s, r) => s + (parseInt(r.jumlahLulusan) || 0), 0);

  const partB = ASPEK_LAM.map((r, i) => {
    const k     = `rtg_er${i + 1}`;
    const vs    = em.map(e => e[k]).filter(Boolean);
    const total = vs.length;
    const cnt   = { 4: 0, 3: 0, 2: 0, 1: 0 };
    vs.forEach(v => { const c = v >= 4 ? 4 : v >= 3 ? 3 : v >= 2 ? 2 : 1; cnt[c]++; });
    const [pSB, pB, pC, pK] = pct1Desimal([cnt[4], cnt[3], cnt[2], cnt[1]], total);
    const pKepuasan = round1(pSB + pB + pC + pK);            // = SUM(C:F) sesuai template
    return { no: i + 1, label: r.lbl, total, pSB, pB, pC, pK, pKepuasan, rtl: rtl[i] || '' };
  });
  const sumOf = key => round1(partB.reduce((s, r) => s + r[key], 0));
  const jumlahRow = { pSB: sumOf('pSB'), pB: sumOf('pB'), pC: sumOf('pC'), pK: sumOf('pK'), pKepuasan: null };

  return { partA, totalTanggapan, totalLulusan, partB, jumlahRow };
}

// ── Perhitungan Tabel 2.8B1 (Waktu Tunggu, per kohort) ──
function compute28B1(al) {
  const cfg  = getLkpsCfg();
  const rows = LKPS_COHORTS.map(c => {
    const cohort   = al.filter(a => parseInt(a.lulus) === c.year);
    const terlacak = cohort.length;
    return {
      ...c,
      jumlahLulusan: cfg[c.key + '_lulus'] || '',
      terlacak,
      lt6 : cohort.filter(a => wtBucket(a.tunggu) === 'lt6').length,
      mid : cohort.filter(a => wtBucket(a.tunggu) === 'mid').length,
      gt18: cohort.filter(a => wtBucket(a.tunggu) === 'gt18').length,
    };
  });
  const totLulusan  = rows.reduce((s, r) => s + (parseInt(r.jumlahLulusan) || 0), 0);
  const totTerlacak = rows.reduce((s, r) => s + r.terlacak, 0);
  const totLt6  = rows.reduce((s, r) => s + r.lt6, 0);
  const totMid  = rows.reduce((s, r) => s + r.mid, 0);
  const totGt18 = rows.reduce((s, r) => s + r.gt18, 0);
  const pctLt6  = totTerlacak ? Math.round(totLt6 / totTerlacak * 100) : 0;
  return { rows, totLulusan, totTerlacak, totLt6, totMid, totGt18, pctLt6 };
}

// ── Perhitungan Tabel 2.8B2 (Tempat Kerja / Berwirausaha, per kohort) ──
function compute28B2(al) {
  const cfg  = getLkpsCfg();
  const rows = LKPS_COHORTS.map(c => {
    const cohort   = al.filter(a => parseInt(a.lulus) === c.year);
    const terlacak = cohort.length;
    return {
      ...c,
      jumlahLulusan: cfg[c.key + '_lulus'] || '',
      terlacak,
      lok  : cohort.filter(a => levelBucket(a.level_kerja) === 'lok').length,
      nas  : cohort.filter(a => levelBucket(a.level_kerja) === 'nas').length,
      multi: cohort.filter(a => levelBucket(a.level_kerja) === 'multi').length,
    };
  });
  const totLulusan  = rows.reduce((s, r) => s + (parseInt(r.jumlahLulusan) || 0), 0);
  const totTerlacak = rows.reduce((s, r) => s + r.terlacak, 0);
  const totLok   = rows.reduce((s, r) => s + r.lok, 0);
  const totNas   = rows.reduce((s, r) => s + r.nas, 0);
  const totMulti = rows.reduce((s, r) => s + r.multi, 0);
  return { rows, totLulusan, totTerlacak, totLok, totNas, totMulti };
}

async function renderLAM() {
  const { al, em } = await getData();
  await loadAllLkpsConfig();
  const div = document.getElementById('lam-report');
  if (!al.length && !em.length) { div.innerHTML = '<div class="empty">Belum ada data.</div>'; return; }

  const editable = isSuperAdmin();
  const c27b  = compute27B(em, al);
  const c28b1 = compute28B1(al);
  const c28b2 = compute28B2(al);

  const jumlahLulusanCell = (key, val) => editable
    ? `<input type="number" min="0" value="${val}" onchange="window._saveLkpsJumlah('${key}_lulus', this.value)"
        style="width:64px;font-size:12px;text-align:center;border:1px solid var(--g300);border-radius:4px;padding:3px">`
    : `${val || '–'}`;

  const rows27bA = c27b.partA.map(r => `<tr>
    <td>${r.label} (${r.year})</td>
    <td style="text-align:center">${jumlahLulusanCell(r.key, r.jumlahLulusan)}</td>
    <td style="text-align:center">${r.tanggapan}</td>
  </tr>`).join('');

  const rtlCell = (i, val) => editable
    ? `<textarea onchange="window._saveLkpsRtl(${i}, this.value)"
        style="width:100%;min-height:46px;font-size:11px;border:1px dashed var(--g300);border-radius:4px;padding:4px;resize:vertical">${val}</textarea>`
    : `<span style="font-size:11px">${val}</span>`;

  const rows27bB = c27b.partB.map(r => `<tr>
    <td style="text-align:center">${r.no}</td>
    <td>${r.label}</td>
    <td style="text-align:center">${r.pSB}%</td>
    <td style="text-align:center">${r.pB}%</td>
    <td style="text-align:center">${r.pC}%</td>
    <td style="text-align:center">${r.pK}%</td>
    <td style="text-align:center"><strong>${r.pKepuasan}%</strong></td>
    <td>${rtlCell(r.no - 1, r.rtl)}</td>
  </tr>`).join('');

  const rows28b1 = c28b1.rows.map(r => `<tr>
    <td>${r.label} (${r.year})</td>
    <td style="text-align:center">${jumlahLulusanCell(r.key, r.jumlahLulusan)}</td>
    <td style="text-align:center">${r.terlacak}</td>
    <td style="text-align:center">${r.lt6}</td>
    <td style="text-align:center">${r.mid}</td>
    <td style="text-align:center">${r.gt18}</td>
  </tr>`).join('');

  const rows28b2 = c28b2.rows.map(r => `<tr>
    <td>${r.label} (${r.year})</td>
    <td style="text-align:center">${jumlahLulusanCell(r.key, r.jumlahLulusan)}</td>
    <td style="text-align:center">${r.terlacak}</td>
    <td style="text-align:center">${r.lok}</td>
    <td style="text-align:center">${r.nas}</td>
    <td style="text-align:center">${r.multi}</td>
  </tr>`).join('');

  div.innerHTML = `
  <div style="display:flex;justify-content:flex-end;margin-bottom:16px" class="export-only-superadmin">
    <button class="exp-btn" onclick="window._exportLKPSExcel()" style="border-color:var(--green);color:var(--green);font-weight:600">
      📊 Download Excel Tabel LKPS (2.7B · 2.7C · 2.8B1 · 2.8B2)
    </button>
  </div>
  ${editable ? `<div class="info-box" style="margin-bottom:16px;font-size:12px">
      <strong>💡 Catatan:</strong> Isi kolom <em>Jumlah Lulusan</em> (total lulusan per angkatan dari data akademik prodi,
      bukan jumlah responden survei) secara manual — angka tersimpan otomatis ke database.
      Kolom <em>Rencana Tindak Lanjut</em> pada Tabel 2.7B dapat diedit langsung.
    </div>` : ''}

  <div class="info-box lam" style="margin-bottom:10px"><strong>📊 Tabel 2.7B — Kepuasan Pengguna Lulusan</strong></div>
  <div class="tw" style="margin-bottom:10px"><table class="dt">
    <thead><tr><th>Tahun Lulus</th><th>Jumlah Lulusan</th><th>Jumlah Tanggapan Kepuasan Pengguna yang Terlacak</th></tr></thead>
    <tbody>${rows27bA}
      <tr style="font-weight:700;background:var(--g100)"><td>Jumlah</td><td style="text-align:center">${c27b.totalLulusan}</td><td style="text-align:center">${c27b.totalTanggapan}</td></tr>
    </tbody>
  </table></div>
  <div class="tw" style="margin-bottom:24px;overflow-x:auto"><table class="dt" style="min-width:760px">
    <thead>
      <tr><th rowspan="2">No</th><th rowspan="2">Jenis Kemampuan</th><th colspan="4">Tingkat Kepuasan Pengguna (%)</th><th rowspan="2">Jumlah Persentase<br>Kepuasan Pengguna (%)</th><th rowspan="2">Rencana Tindak Lanjut oleh UPPS/PS</th></tr>
      <tr><th>Sangat Baik</th><th>Baik</th><th>Cukup</th><th>Kurang</th></tr>
    </thead>
    <tbody>${rows27bB}
      <tr style="font-weight:700;background:var(--g100)">
        <td colspan="2">Jumlah</td>
        <td style="text-align:center">${c27b.jumlahRow.pSB}%</td>
        <td style="text-align:center">${c27b.jumlahRow.pB}%</td>
        <td style="text-align:center">${c27b.jumlahRow.pC}%</td>
        <td style="text-align:center">${c27b.jumlahRow.pK}%</td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table></div>
  <p style="font-size:11px;color:var(--g500);margin:-16px 0 24px;font-style:italic">
    Rumus sesuai template LKPS LAM PTIP IAPS 1.0: kolom 7 = Sangat Baik + Baik + Cukup + Kurang;
    baris Jumlah = penjumlahan ketujuh aspek per kolom (kolom 7 baris Jumlah dikosongkan seperti template).
  </p>

  <div class="info-box lam" style="margin-bottom:10px"><strong>📊 Tabel 2.7C — Kepuasan Stakeholder Internal & Eksternal (${_cache.sk?.length || 0} responden)</strong></div>
  <div class="tw" style="margin-bottom:24px">${render27CTable(_cache.sk || [])}</div>

  <div class="info-box lam" style="margin-bottom:10px"><strong>📊 Tabel 2.8B1 — Waktu Tunggu Lulusan</strong></div>
  <div class="tw" style="margin-bottom:8px;overflow-x:auto"><table class="dt" style="min-width:640px">
    <thead>
      <tr><th rowspan="2">Tahun Lulus</th><th rowspan="2">Jumlah Lulusan</th><th rowspan="2">Jumlah Lulusan yang Terlacak</th><th colspan="3">Waktu Tunggu Mendapatkan Pekerjaan</th></tr>
      <tr><th>WT &lt; 6 bulan</th><th>6 ≤ WT ≤ 18 bulan</th><th>WT &gt; 18 bulan</th></tr>
    </thead>
    <tbody>${rows28b1}
      <tr style="font-weight:700;background:var(--g100)"><td>Jumlah</td><td style="text-align:center">${c28b1.totLulusan}</td><td style="text-align:center">${c28b1.totTerlacak}</td><td style="text-align:center">${c28b1.totLt6}</td><td style="text-align:center">${c28b1.totMid}</td><td style="text-align:center">${c28b1.totGt18}</td></tr>
    </tbody>
  </table></div>
  <div class="info-box lam" style="margin-bottom:24px"><strong>WT1 (Persentase lulusan dengan waktu tunggu &lt; 6 bulan) = ${c28b1.pctLt6}%</strong></div>

  <div class="info-box lam" style="margin-bottom:10px"><strong>📊 Tabel 2.8B2 — Tempat Kerja / Berwirausaha</strong></div>
  <div class="tw" style="overflow-x:auto"><table class="dt" style="min-width:700px">
    <thead>
      <tr><th rowspan="2">Tahun Lulus</th><th rowspan="2">Jumlah Lulusan</th><th rowspan="2">Jumlah Lulusan yang Terlacak</th><th colspan="3">Tingkat/Ukuran Tempat Kerja atau Berwirausaha</th></tr>
      <tr><th>Lokal/Wilayah/<br>Wirausaha Tdk Berbadan Hukum</th><th>Nasional/<br>Wirausaha Berbadan Hukum</th><th>Multinasional/<br>Internasional</th></tr>
    </thead>
    <tbody>${rows28b2}
      <tr style="font-weight:700;background:var(--g100)"><td>Jumlah</td><td style="text-align:center">${c28b2.totLulusan}</td><td style="text-align:center">${c28b2.totTerlacak}</td><td style="text-align:center">${c28b2.totLok}</td><td style="text-align:center">${c28b2.totNas}</td><td style="text-align:center">${c28b2.totMulti}</td></tr>
    </tbody>
  </table></div>`;
}

// ════════════════════════════════════════════════════════
//  ANALISIS & PEMBAHASAN
// ════════════════════════════════════════════════════════
async function renderAnalisis() {
  const { al, em, sk } = await getData();
  await loadAllLkpsConfig();
  document.getElementById('cover-date').textContent =
    'Dicetak: ' + new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});

  const bekerja  = al.filter(isBekerja).length;
  const pctKerja = al.length ? Math.round(bekerja/al.length*100) : 0;
  document.getElementById('sec-profil').innerHTML = `
    <div class="sg" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="sc"><div class="sl">Total Alumni</div><div class="sv">${al.length}</div></div>
      <div class="sc"><div class="sl">Total Instansi</div><div class="sv">${em.length}</div></div>
      <div class="sc"><div class="sl">% Bekerja</div><div class="sv">${pctKerja}<span class="su">%</span></div></div>
    </div>`;

  renderLAM27B(em, al);
  renderLAM27C(sk);
  renderLAM28B1(al);
  renderLAM28B2(al);
  renderRTL(al, em);
}

// Tabel 2.7B untuk laporan cetak — memakai perhitungan resmi (compute27B), format sama dengan template
function renderLAM27B(em, al) {
  const el = document.getElementById('sec-27b');
  if (!em.length) { el.innerHTML = '<div class="empty">Belum ada data pengguna lulusan.</div>'; return; }
  const c = compute27B(em, al || []);
  const rows = c.partB.map(r => `<tr><td>${r.no}</td><td>${r.label}</td><td>${r.pSB}%</td><td>${r.pB}%</td><td>${r.pC}%</td><td>${r.pK}%</td><td><strong>${r.pKepuasan}%</strong></td></tr>`).join('');
  el.innerHTML = `<div class="tw"><table class="dt">
    <thead><tr><th>No</th><th>Jenis Kemampuan</th><th>Sangat Baik</th><th>Baik</th><th>Cukup</th><th>Kurang</th><th>Jumlah % Kepuasan</th></tr></thead>
    <tbody>${rows}
      <tr style="font-weight:700"><td colspan="2">Jumlah</td><td>${c.jumlahRow.pSB}%</td><td>${c.jumlahRow.pB}%</td><td>${c.jumlahRow.pC}%</td><td>${c.jumlahRow.pK}%</td><td></td></tr>
    </tbody></table></div>`;
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
  const c = compute28B1(al);
  const rows = c.rows.map(r => `<tr><td>${r.label} (${r.year})</td><td>${r.terlacak}</td><td>${r.lt6}</td><td>${r.mid}</td><td>${r.gt18}</td></tr>`).join('');
  el.innerHTML = `<div class="tw"><table class="dt">
    <thead><tr><th>Tahun Lulus</th><th>Terlacak</th><th>WT&lt;6 bln</th><th>6≤WT≤18 bln</th><th>WT&gt;18 bln</th></tr></thead>
    <tbody>${rows}
      <tr style="font-weight:700"><td>Jumlah</td><td>${c.totTerlacak}</td><td>${c.totLt6}</td><td>${c.totMid}</td><td>${c.totGt18}</td></tr>
    </tbody></table></div>
    <p style="font-size:12px;margin-top:8px"><strong>WT1 = ${c.pctLt6}%</strong> (persentase lulusan dengan waktu tunggu &lt; 6 bulan)</p>`;
}

function renderLAM28B2(al) {
  const el = document.getElementById('sec-28b2');
  if (!al.length) { el.innerHTML = '<div class="empty">Belum ada data alumni.</div>'; return; }
  const c = compute28B2(al);
  const rows = c.rows.map(r => `<tr><td>${r.label} (${r.year})</td><td>${r.terlacak}</td><td>${r.lok}</td><td>${r.nas}</td><td>${r.multi}</td></tr>`).join('');
  el.innerHTML = `<div class="tw"><table class="dt">
    <thead><tr><th>Tahun Lulus</th><th>Terlacak</th><th>Lokal</th><th>Nasional</th><th>Multinasional</th></tr></thead>
    <tbody>${rows}
      <tr style="font-weight:700"><td>Jumlah</td><td>${c.totTerlacak}</td><td>${c.totLok}</td><td>${c.totNas}</td><td>${c.totMulti}</td></tr>
    </tbody></table></div>`;
}

function renderRTL(al, em) {
  const c28b1  = compute28B1(al);
  const avg7   = avgRtg(em, ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
  document.getElementById('tb-rtl').innerHTML = `
    <tr><td>1</td><td>Kepuasan Pengguna Lulusan</td><td>Rata-rata 7 aspek: ${avg7}/4</td>
        <td>Peningkatan kompetensi bahasa asing & TIK melalui kurikulum</td><td>1 tahun</td><td>Kaprodi</td></tr>
    <tr><td>2</td><td>Waktu Tunggu Kerja</td><td>WT1 (WT &lt; 6 bln): ${c28b1.pctLt6}%</td>
        <td>Perkuat program magang & career fair dengan instansi mitra</td><td>6 bulan</td><td>Kaprodi</td></tr>
    <tr><td>3</td><td>Kesesuaian Bidang Kerja</td><td>Data dari ${al.length} responden</td>
        <td>Penguatan link & match kurikulum dengan kebutuhan industri</td><td>1 tahun</td><td>Kaprodi</td></tr>`;
}

// ════════════════════════════════════════════════════════
//  DATA TABEL
// ════════════════════════════════════════════════════════
async function renderTableAlumni() {
  const { al } = await getData();
  const editable = isSuperAdmin();
  const LEVEL_OPTIONS = [
    'Lokal / Wilayah (termasuk wirausaha tidak berizin)',
    'Nasional / Berbadan Hukum',
    'Multinasional / Internasional',
  ];
  const levelCell = a => editable
    ? `<select onchange="window._updateAlumniField('${a.id}','level_kerja',this.value||null)"
        style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid ${a.level_kerja ? 'var(--g300)' : 'var(--red)'};background:#fff;cursor:pointer;max-width:160px">
        <option value="">— Belum diisi —</option>
        ${LEVEL_OPTIONS.map(l => `<option value="${l}" ${a.level_kerja===l?'selected':''}>${l}</option>`).join('')}
        ${a.level_kerja && !LEVEL_OPTIONS.includes(a.level_kerja) ? `<option selected>${a.level_kerja}</option>` : ''}
      </select>`
    : `${a.level_kerja||'–'}`;
  document.getElementById('tb-al').innerHTML = al.length
    ? al.map(a => `<tr>
        <td><strong>${a.nama||'–'}</strong></td><td>${a.nim||'–'}</td><td>${a.lulus||'–'}</td>
        <td>${a.email||'–'}</td><td><span class="bdg bgt">${a.status||(isBekerja(a)?'Bekerja':'–')}</span></td>
        <td>${a.instansi||'–'}</td><td>${(a.bidang||'–').split('(')[0].trim()}</td>
        <td>${levelCell(a)}</td><td><span class="bdg bgb">${a.tunggu||'–'}</span></td>
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
  const editable = isSuperAdmin();
  const thn = e => e.alumni_tahun_lulus ?? e.alumni_lulus_tahun ?? '';
  const tahunCell = e => editable
    ? `<input type="number" min="2000" max="2035" value="${thn(e)}" placeholder="Thn"
        onchange="window._updateEmployerField('${e.id}','alumni_tahun_lulus',this.value?parseInt(this.value):null)"
        style="width:64px;font-size:12px;text-align:center;border:1px solid ${thn(e) ? 'var(--g300)' : 'var(--red)'};border-radius:4px;padding:3px">`
    : `${thn(e) || '–'}`;

  document.getElementById('tb-em').innerHTML = em.length
    ? em.map(e => `<tr>
        <td><strong>${e.instansi||'–'}</strong></td><td>${e.sektor||'–'}</td>
        <td>${e.kota||'–'}</td><td>${e.pengisi||'–'}</td><td>${e.email||'–'}</td>
        <td>${e.alumni_nama||'–'}</td>
        <td>${tahunCell(e)}</td>
        <td><span class="bdg bgg">${e.kepuasan||'–'}</span></td>
        <td>${e.rekrut||'–'}</td>
        <td style="font-size:10.5px;white-space:nowrap">${new Date(e.created_at).toLocaleString('id-ID')}</td>
        <td class="delete-only-superadmin">
          <button onclick="window._deleteRow('${TBL_EMPLOYER}','${e.id}')"
            style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--red);color:var(--red);background:#fff;cursor:pointer">
            Hapus
          </button>
        </td></tr>`).join('')
    : '<tr><td colspan="11"><div class="empty">Belum ada data pengguna lulusan.</div></td></tr>';
}

// Update satu field (dipakai superadmin untuk melengkapi data) — tersimpan ke Supabase
async function updateField(table, id, field, value) {
  if (!isSuperAdmin()) { alert('Akses ditolak.'); return false; }
  const { data, error } = await db.from(table).update({ [field]: value }).eq('id', id).select('id');
  if (error) { alert('Gagal menyimpan: ' + error.message); return false; }
  if (!data || !data.length) {
    alert(`Data tidak tersimpan: database menolak perubahan (izin UPDATE/RLS untuk tabel ${table} belum diaktifkan).`);
    return false;
  }
  clearCache();
  await getData();
  return true;
}
window._updateEmployerField = async function (id, field, value) {
  if (!await updateField(TBL_EMPLOYER, id, field, value)) renderTableEmployer();
};
window._updateAlumniField = async function (id, field, value) {
  if (!await updateField(TBL_ALUMNI, id, field, value)) renderTableAlumni();
};

// ════════════════════════════════════════════════════════
//  TABEL 2.7C — KEPUASAN STAKEHOLDER (Format LAM PTIP Lengkap)
// ════════════════════════════════════════════════════════

// Konfigurasi Tabel 2.7C (populasi, instrumen, tindak lanjut).
// MSP: disimpan di Supabase tabel ts_config (key "sk_27c_config") agar permanen dan sama
// di semua perangkat; isian yang sudah ada tetap dipakai. localStorage hanya cadangan.
const SK_CONFIG_KEY = 'sk_27c_config';
let _skConfigCache = null;

function getSkConfig() {
  if (_skConfigCache !== null) return _skConfigCache;
  try { return JSON.parse(localStorage.getItem(SK_CONFIG_KEY) || '{}'); } catch { return {}; }
}
async function loadSkConfig() {
  try {
    const { data, error } = await db.from(TBL_CONFIG).select('value').eq('key', SK_CONFIG_KEY).maybeSingle();
    if (error) throw error;
    if (data && data.value) {
      _skConfigCache = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } else {
      // Belum ada di Supabase — pakai data lama dari localStorage bila ada
      let legacy = {};
      try { legacy = JSON.parse(localStorage.getItem(SK_CONFIG_KEY) || '{}'); } catch {}
      _skConfigCache = legacy;
    }
  } catch (e) {
    console.error('Gagal memuat konfigurasi Tabel 2.7C dari Supabase:', e);
    try { _skConfigCache = JSON.parse(localStorage.getItem(SK_CONFIG_KEY) || '{}'); } catch { _skConfigCache = {}; }
  }
  return _skConfigCache;
}
async function saveSkConfig(cfg) {
  _skConfigCache = cfg;
  try { localStorage.setItem(SK_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
  const { error } = await db.from(TBL_CONFIG).upsert({ key: SK_CONFIG_KEY, value: cfg }, { onConflict: 'key' });
  if (error) alert(`⚠️ Gagal menyimpan ke database: ${error.message}\nData hanya tersimpan sementara di browser ini.`);
}

// PENTING: "value" harus SAMA PERSIS dengan value radio button "sk-jenis" di formulir MSP
// (index.html), karena itulah nilai yang tersimpan di kolom `jenis` tabel ts_stakeholder
// (nilai lama ber-akhiran "Aktif" sudah disatukan di getData). "label" untuk tampilan laporan.
const JENIS_LIST = [
  { value: 'Mahasiswa',           label: 'Mahasiswa' },
  { value: 'Dosen',               label: 'Dosen' },
  { value: 'Tenaga Kependidikan', label: 'Tenaga Kependidikan' },
  { value: 'Mitra',               label: 'Mitra' },
  { value: 'Lulusan',             label: 'Lulusan' },
  { value: 'Pengguna Lulusan',    label: 'Pengguna Lulusan' },
  { value: 'Lainnya',             label: 'Lainnya' },
];
const TAHUN = { TS: TAHUN_SURVEI.TS, TS1: TAHUN_SURVEI.TS_1, TS2: TAHUN_SURVEI.TS_2 };

// Populasi: nilai yang diisi superadmin; bila kosong, Mahasiswa memakai
// DATA_AKADEMIK.mahasiswa_aktif (config.js) seperti sebelumnya.
function popVal(c, jLbl, field) {
  const saved = parseInt(c?.[field] || 0);
  if (saved > 0) return saved;
  if (jLbl === 'Mahasiswa') {
    const yr = field === 'popTS2' ? TAHUN_SURVEI.TS_2 : field === 'popTS1' ? TAHUN_SURVEI.TS_1 : TAHUN_SURVEI.TS;
    return parseInt(DATA_AKADEMIK?.mahasiswa_aktif?.[yr] || 0);
  }
  return 0;
}

// Isi awal kolom "Tindak Lanjut" Tabel 2.7C (bisa diedit superadmin; dipakai bila belum diisi)
const DEFAULT_TINDAK_27C = {
  'Mahasiswa'           : 'Meningkatkan layanan akademik dan kemahasiswaan melalui evaluasi pembelajaran tiap semester, penguatan bimbingan akademik, dan perbaikan sarana praktikum/laboratorium',
  'Dosen'               : 'Mempertahankan dukungan manajemen prodi melalui pengembangan kompetensi dosen (pelatihan, studi lanjut, hibah penelitian dan PkM) serta pemerataan beban kerja',
  'Tenaga Kependidikan' : 'Meningkatkan kompetensi tenaga kependidikan melalui pelatihan layanan administrasi dan sistem informasi akademik, serta memperjelas SOP layanan',
  'Mitra'               : 'Meningkatkan intensitas dan kualitas kerja sama melalui pertemuan berkala dengan mitra, perluasan MoU/PKS, dan tindak lanjut kegiatan bersama (magang, penelitian, PkM)',
  'Lulusan'             : 'Memperkuat hubungan dengan alumni melalui tracer study rutin, forum alumni, serta pelibatan alumni dalam pengembangan kurikulum dan pembekalan karier mahasiswa',
  'Pengguna Lulusan'    : 'Menindaklanjuti masukan pengguna lulusan dalam peninjauan kurikulum, terutama penguatan bahasa asing, teknologi informasi, dan soft skill lulusan',
  'Lainnya'             : 'Menghimpun dan menindaklanjuti masukan pemangku kepentingan lain melalui kanal saran prodi dan rapat evaluasi tahunan',
};

// ── Perhitungan satu baris Tabel 2.7C (dipakai tampilan layar & ekspor Excel,
//    supaya angkanya selalu sama).
//    • Jumlah Responden (kol. 5–7): per tahun survei TS-2, TS-1, TS.
//    • SB/B/C/KB (kol. 11–14): SEMUA responden TS-2 s.d. TS (jadi SB+B+C+KB = kol. 5+6+7),
//      dikelompokkan dari rata-rata 7 aspek
//      (≥3,5 = SB; ≥2,5 = B; ≥1,5 = C; <1,5 = K).
//    • Skor (kol. 15): rumus resmi template LKPS = (4·SB + 3·B + 2·C + 1·K) / (SB+B+C+K).
const SK_KEYS = ['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7'];
function hitung27CBaris(sk, jenisValue) {
  const th  = x => parseInt(x.tahun_survei);
  const grp = sk.filter(x => (x.jenis || '').trim() === jenisValue);
  const rTS2 = grp.filter(x => th(x) === TAHUN_SURVEI.TS_2).length;
  const rTS1 = grp.filter(x => th(x) === TAHUN_SURVEI.TS_1).length;
  const rTS  = grp.filter(x => th(x) === TAHUN_SURVEI.TS).length;
  const cnt  = { SB:0, B:0, C:0, K:0 };
  const TAHUN3 = [TAHUN_SURVEI.TS_2, TAHUN_SURVEI.TS_1, TAHUN_SURVEI.TS];
  grp.filter(x => TAHUN3.includes(th(x))).forEach(x => {
    const vals = SK_KEYS.map(k => x[k]).filter(Boolean);
    if (!vals.length) return;
    const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
    if (avg >= 3.5) cnt.SB++; else if (avg >= 2.5) cnt.B++;
    else if (avg >= 1.5) cnt.C++; else cnt.K++;
  });
  const n = cnt.SB + cnt.B + cnt.C + cnt.K;
  const skor = n ? ((4*cnt.SB + 3*cnt.B + 2*cnt.C + cnt.K) / n).toFixed(2) : '–';
  return { rTS2, rTS1, rTS, cnt, skor };
}
function skorLKPS(cnt) {
  const n = cnt.SB + cnt.B + cnt.C + cnt.K;
  return n ? ((4*cnt.SB + 3*cnt.B + 2*cnt.C + cnt.K) / n).toFixed(2) : '–';
}

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
        <th rowspan="3" style="text-align:center;vertical-align:middle;min-width:220px">Tindak Lanjut</th>
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

  const rows = JENIS_LIST.map((jObj, idx) => {
    const j     = jObj.value;   // nilai asli di kolom `jenis` (harus cocok persis dengan form)
    const jLbl  = jObj.label;   // label ringkas untuk tampilan
    const no    = idx < 6 ? idx + 1 : '...';
    const jKey  = jLbl.replace(/\s+/g,'_');
    const c     = cfg[jKey] || {};

    const { rTS2, rTS1, rTS, cnt, skor } = hitung27CBaris(sk, j);

    // Populasi (input manual admin)
    const popTS2 = popVal(c, jLbl, 'popTS2');
    const popTS1 = popVal(c, jLbl, 'popTS1');
    const popTS  = popVal(c, jLbl, 'popTS');

    const pct = (r, p) => (p > 0 ? Math.round(r / p * 100) + '%' : '–');
    const skorBadge = skor !== '–' ? (parseFloat(skor)>=3.5?'bgg':parseFloat(skor)>=2.5?'bgt':parseFloat(skor)>=1.5?'bgo':'') : '';

    // Instrumen & Tindak Lanjut — editable oleh superadmin
    const instrAda    = c.instrAda    === '1';
    const instrTidak  = c.instrAda    === '0';
    const tindakLanjut = c.tindak || DEFAULT_TINDAK_27C[jLbl] || '';

    return `<tr>
      <td style="text-align:center;font-weight:600">${no}</td>
      <td style="font-weight:500">${jLbl}${jLbl==='Lulusan'?'<span style="color:var(--g500);font-size:10px"> (*)</span>':''}</td>
      <td style="text-align:center">
        ${isSuperAdmin() ? `<select onchange="window._skCfgSave('${jKey}','instrAda',this.value)"
          style="font-size:11px;padding:2px 4px;border:1px solid var(--g200);border-radius:4px;width:82px">
          <option value="">–</option>
          <option value="1" ${instrAda?'selected':''}>✓ Ada</option>
          <option value="0" ${instrTidak?'selected':''}>✗ Tidak</option>
        </select>` : `<span style="font-size:11px">${instrAda?'✓ Ada':instrTidak?'✗ Tidak':'–'}</span>`}
      </td>
      <td style="text-align:center">
        <span style="font-size:12px">${instrTidak?'✓':'–'}</span>
      </td>
      <td style="text-align:center">
        <input type="number" min="0" value="${rTS2}"
          style="width:52px;font-size:11px;text-align:center;border:1px solid var(--g200);border-radius:4px;padding:2px"
          readonly title="Dihitung otomatis dari database (${rTS2} responden tahun ${TAHUN.TS2})">
      </td>
      <td style="text-align:center">
        <input type="number" min="0" value="${rTS1}"
          style="width:52px;font-size:11px;text-align:center;border:1px solid var(--g200);border-radius:4px;padding:2px"
          readonly title="Dihitung otomatis dari database (${rTS1} responden tahun ${TAHUN.TS1})">
      </td>
      <td style="text-align:center">
        <input type="number" min="0" value="${rTS}"
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
          style="width:100%;font-size:11px;border:1px dashed var(--g300);border-radius:4px;padding:4px;resize:vertical;min-height:92px;font-family:inherit"
          placeholder="Isi tindak lanjut...">${tindakLanjut}</textarea>` :
          `<span style="font-size:11px;color:var(--g600)">${tindakLanjut||'–'}</span>`}
      </td>
    </tr>`;
  }).join('');

  // ── Baris Jumlah
  const hasil = JENIS_LIST.map(jo => hitung27CBaris(sk, jo.value));
  const tot   = hasil.reduce((a, r) => ({
    rTS2: a.rTS2 + r.rTS2, rTS1: a.rTS1 + r.rTS1, rTS: a.rTS + r.rTS,
    cnt: { SB: a.cnt.SB + r.cnt.SB, B: a.cnt.B + r.cnt.B, C: a.cnt.C + r.cnt.C, K: a.cnt.K + r.cnt.K },
  }), { rTS2:0, rTS1:0, rTS:0, cnt:{ SB:0, B:0, C:0, K:0 } });
  const jumlahRow = `<tr style="background:var(--g50);font-weight:700;border-top:2px solid var(--navy)">
    <td colspan="2" style="text-align:center">Jumlah</td><td colspan="2"></td>
    <td style="text-align:center">${tot.rTS2}</td><td style="text-align:center">${tot.rTS1}</td><td style="text-align:center">${tot.rTS}</td>
    <td colspan="3"></td>
    <td style="text-align:center">${tot.cnt.SB}</td><td style="text-align:center">${tot.cnt.B}</td>
    <td style="text-align:center">${tot.cnt.C}</td><td style="text-align:center">${tot.cnt.K}</td>
    <td style="text-align:center">${skorLKPS(tot.cnt)}</td><td></td>
  </tr>`;

  // ── Data yang tidak masuk tabel (jenis tidak dikenal / tahun di luar TS-2..TS)
  const nilaiJenis = JENIS_LIST.map(jo => jo.value);
  const tahunOK    = [TAHUN_SURVEI.TS_2, TAHUN_SURVEI.TS_1, TAHUN_SURVEI.TS];
  const luar = sk.filter(x => !nilaiJenis.includes((x.jenis || '').trim()) || !tahunOK.includes(parseInt(x.tahun_survei)));
  const warningHtml = luar.length ? `
    <div class="info-box warn" style="margin-top:10px;font-size:12px">
      ⚠️ <strong>${luar.length} dari ${sk.length} data stakeholder tidak masuk tabel</strong> karena kolom jenis/tahun survei tidak sesuai kategori LKPS:
      ${[...new Set(luar.map(x => `"${x.jenis || '(kosong)'}" / ${x.tahun_survei ?? '(kosong)'}`))].join(', ')}
    </div>` : '';

  const keterangan = `<p style="font-size:11px;color:var(--g500);margin-top:10px;font-style:italic">
    <strong>Keterangan:</strong> Kolom 5–7 = jumlah responden per tahun survei. Kolom 11–14 = seluruh responden TS-2 s.d. TS
    (sehingga SB + B + C + KB = kolom 5 + 6 + 7), dikelompokkan dari rata-rata 7 aspek penilaiannya
    <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:10px;background:var(--g100);color:var(--g600);font-style:normal;font-weight:600">Versi perhitungan: 29-09-2026 · gabungan TS-2 s.d. TS</span> (SB = 4, B = 3, C = 2, K = 1).
    Skor = (4×SB + 3×B + 2×C + 1×K) ÷ (SB+B+C+K), sesuai rumus template LKPS LAM PTIP IAPS 1.0.<br>
    ${isSuperAdmin()?'<span style="color:var(--teal)">💡 <strong>Superadmin:</strong> Isi kolom populasi (input kecil di bawah %) dan tindak lanjut. Data tersimpan otomatis ke database.</span>':''}
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

// Save config ke localStorage
window._skCfgSave = async function(jKey, field, value) {
  if (!isSuperAdmin()) return;
  const cfg = { ...getSkConfig() };
  cfg[jKey] = { ...(cfg[jKey] || {}) };
  cfg[jKey][field] = value;
  await saveSkConfig(cfg);
  // Hitung ulang tabel segera (persentase keterwakilan, kolom "Tidak Ada")
  if (document.getElementById('ap-lam')?.classList.contains('a')) renderLAM();
  else if (document.getElementById('ap-analisis')?.classList.contains('a')) renderLAM27C(_cache.sk || []);
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

// Patch deleteRow agar support TBL_STAKEHOLDER
window._deleteRow = async function(table, id) {
  if (!isSuperAdmin()) return alert('Akses ditolak.');
  if (!confirm('Yakin hapus data ini?')) return;
  const { data: terhapus, error } = await db.from(table).delete().eq('id', id).select('id');
  if (error) { alert('Gagal menghapus: ' + error.message); return; }
  if (!terhapus || !terhapus.length) {
    alert('Data tidak terhapus: database menolak penghapusan (izin hapus/RLS untuk tabel ' + table + ' belum diaktifkan).');
    return;
  }
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
  const jsEsc = s => String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const meId  = getUser()?.id;

  document.getElementById('tb-admins').innerHTML = (data||[]).map(u => {
    const isSelf = meId === u.id;
    return `<tr>
    <td><strong>${u.username}</strong></td>
    <td>${u.full_name||'–'}</td>
    <td><span class="bdg ${u.role===ROLE.SUPERADMIN?'bgb':'bgt'}">${u.role}</span></td>
    <td><span class="bdg ${u.is_active?'bgg':''}">${u.is_active?'Aktif':'Nonaktif'}</span></td>
    <td style="font-size:10.5px">${new Date(u.created_at).toLocaleDateString('id-ID')}</td>
    <td style="white-space:nowrap">
      <button onclick="window._editAdmin(${u.id},'${jsEsc(u.username)}','${jsEsc(u.full_name)}')"
        style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--teal);color:var(--teal);background:#fff;cursor:pointer;margin-right:4px">
        Edit
      </button>
      ${isSelf ? '<span style="font-size:10.5px;color:var(--g500)">(akun Anda)</span>' : `
      <button onclick="window._toggleAdmin(${u.id},${u.is_active})"
        style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--g200);background:#fff;cursor:pointer">
        ${u.is_active?'Nonaktifkan':'Aktifkan'}
      </button>
      <button onclick="window._deleteAdmin(${u.id})"
        style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--red);color:var(--red);background:#fff;cursor:pointer;margin-left:4px">
        Hapus
      </button>`}
    </td></tr>`;
  }).join('');
}

// Edit username / nama / password akun admin manapun (termasuk superadmin lain)
window._editAdmin = async function (id, curUsername, curNama) {
  if (!isSuperAdmin()) return;
  const username = prompt('Username:', curUsername || '');
  if (username === null) return;               // dibatalkan
  if (!username.trim()) return alert('Username tidak boleh kosong.');

  const nama = prompt('Nama Lengkap:', curNama || '');
  if (nama === null) return;

  const password = prompt('Password baru (kosongkan supaya password lama tetap dipakai):', '');
  if (password === null) return;

  const updates = { username: username.trim(), full_name: nama.trim() };
  if (password.trim()) updates.password = password.trim();

  const { error } = await db.from(TBL_ADMINS).update(updates).eq('id', id);
  if (error) { alert('Gagal menyimpan: ' + error.message); return; }
  loadAdmins();
};

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

  // Hitung statistik untuk prompt — memakai perhitungan yang sama dengan tabel LKPS
  const bekerja    = al.filter(isBekerja).length;
  const pctKerja   = al.length ? Math.round(bekerja/al.length*100) : 0;
  const avg7       = avgRtg(em,['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
  const avgProdi   = avgRtg(al,['rtg_ar1','rtg_ar2','rtg_ar3','rtg_ar4','rtg_ar5','rtg_ar6','rtg_ar7']);
  const avgSk      = avgRtg(sk,['rtg_sk1','rtg_sk2','rtg_sk3','rtg_sk4','rtg_sk5','rtg_sk6','rtg_sk7']);
  const pctLt6     = compute28B1(al).pctLt6;
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
- Persentase lulusan yang bekerja: ${pctKerja}%
- Persentase kesesuaian bidang kerja (Erat + Sangat Erat): ${pctRelevan}%
- Persentase lulusan dengan waktu tunggu < 6 bulan (WT1, Tabel 2.8B1): ${pctLt6}%
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
  // Ambil langsung dari kolom input (sumber paling akhir), lalu cek formatnya
  const inpKey = (document.getElementById('ai-key-input')?.value || '').trim();
  const GEMINI_KEY = /^AIza[0-9A-Za-z_\-]{30,}$/.test(inpKey) ? inpKey : (window.GEMINI_API_KEY || '').trim();
  if (!/^AIza[0-9A-Za-z_\-]{30,}$/.test(GEMINI_KEY)) {
    cont.innerHTML = `
      <div class="info-box err">
        <strong>⚠️ API Key Gemini belum diisi atau tidak valid</strong><br>
        Isian pada kolom 🔑 bukan API key Gemini (key Gemini selalu diawali <code>AIza</code>). Jika kolom terisi password, itu diisi otomatis oleh browser — hapus lalu tempel key Gemini Anda.<br>
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
  if (!isLoggedIn()) return alert('Silakan login terlebih dahulu.');
  const { al, em, sk } = await getData();
  const data = type==='alumni' ? al : type==='stakeholder' ? sk : em;
  if (!data.length) return alert('Belum ada data untuk diekspor.');
  const headers = Object.keys(data[0]);
  const rows    = data.map(d=>headers.map(h=>`"${String(d[h]||'').replace(/"/g,'""')}"`));
  const csv     = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
  const a       = document.createElement('a');
  a.href        = 'data:text/csv;charset=utf-8,﻿'+encodeURIComponent(csv);
  a.download    = `survei_msp_${type}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ════════════════════════════════════════════════════════
//  HELPER — muat SheetJS & bangun baris data mentah
// ════════════════════════════════════════════════════════
async function ensureXLSX() {
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return window.XLSX;
}

function alRawRows(al) {
  return al.map(a => ({
    'Nama'        : a.nama||'',
    'NIM'         : a.nim||'',
    'Thn Masuk'   : a.masuk||'',
    'Thn Lulus'   : a.lulus||'',
    'Email'       : a.email||'',
    'HP'          : a.hp||'',
    'Gender'      : a.gender||'',
    'IPK'         : a.ipk||'',
    'Status'      : a.status || (isBekerja(a) ? 'Bekerja' : ''),
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
  }));
}

function emRawRows(em) {
  return em.map(e => ({
    'Instansi'    : e.instansi||'',
    'Sektor'      : e.sektor||'',
    'Kota'        : e.kota||'',
    'Pengisi'     : e.pengisi||'',
    'Jabatan'     : e.jab_pengisi||'',
    'Email'       : e.email||'',
    'Telp'        : e.telp||'',
    'Alumni'      : e.alumni_nama||'',
    'Tahun Alumni': e.alumni_tahun_lulus ?? e.alumni_lulus_tahun ?? '',
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
  }));
}

function skRawRows(sk) {
  return sk.map(s => ({
    'Jenis'       : s.jenis||'',
    'Tahun Survei': s.tahun_survei||'',
    'Nama'        : s.nama||'',
    'Instansi'    : s.instansi||'',
    'Email'       : s.email||'',
    'Rtg SK1'     : s.rtg_sk1||'',
    'Rtg SK2'     : s.rtg_sk2||'',
    'Rtg SK3'     : s.rtg_sk3||'',
    'Rtg SK4'     : s.rtg_sk4||'',
    'Rtg SK5'     : s.rtg_sk5||'',
    'Rtg SK6'     : s.rtg_sk6||'',
    'Rtg SK7'     : s.rtg_sk7||'',
    'Kepuasan'    : s.kepuasan||'',
    'Tgl Isi'     : new Date(s.created_at).toLocaleDateString('id-ID'),
  }));
}

// Bangun lembar Tabel 2.7C persis format resmi LKPS (dipakai di exportLKPSExcel)
function build27CAOA(sk) {
  const cfg  = getSkConfig();
  const rows = [];
  rows.push(['Tabel 2.7C Kepuasan Stakeholder Internal dan Eksternal']);
  rows.push(['Diisi oleh pengusul dari Program Studi Manajemen Sumber Daya Perairan (MSP) FPIK UNSRAT']);
  rows.push(['No','Stakeholder','Instrumen','','Jumlah Responden','','','Persentase Keterwakilan Responden','','',
              'Jumlah Responden yang menjawab (SB=4, B=3, C=2, K=1)','','','','Skor','Tindak Lanjut']);
  rows.push(['','','Ada','Tidak Ada',
              `TS-2 (${TAHUN_SURVEI.TS_2})`, `TS-1 (${TAHUN_SURVEI.TS_1})`, `TS (${TAHUN_SURVEI.TS})`,
              `TS-2 (${TAHUN_SURVEI.TS_2})`, `TS-1 (${TAHUN_SURVEI.TS_1})`, `TS (${TAHUN_SURVEI.TS})`,
              'SB','B','C','KB','','']);

  JENIS_LIST.forEach((jObj, idx) => {
    const j    = jObj.value;
    const jLbl = jObj.label;
    const jKey = jLbl.replace(/\s+/g,'_');
    const c    = cfg[jKey] || {};
    const { rTS2, rTS1, rTS, cnt, skor } = hitung27CBaris(sk, j);
    const popTS2 = popVal(c, jLbl, 'popTS2'), popTS1 = popVal(c, jLbl, 'popTS1'), popTS = popVal(c, jLbl, 'popTS');
    const pct  = (r,p) => p>0 ? Math.round(r/p*100)+'%' : '-';
    rows.push([idx+1, jLbl+(jLbl==='Lulusan'?' (*)':''), c.instrAda==='1'?'Ada':'', c.instrAda==='0'?'Tidak Ada':'',
               rTS2, rTS1, rTS, pct(rTS2,popTS2), pct(rTS1,popTS1), pct(rTS,popTS),
               cnt.SB, cnt.B, cnt.C, cnt.K, skor === '–' ? '-' : Number(skor), c.tindak || DEFAULT_TINDAK_27C[jLbl] || '']);
  });
  {
    const hs = JENIS_LIST.map(jo => hitung27CBaris(sk, jo.value));
    const t  = hs.reduce((a,r)=>({ a2:a.a2+r.rTS2, a1:a.a1+r.rTS1, a0:a.a0+r.rTS,
      SB:a.SB+r.cnt.SB, B:a.B+r.cnt.B, C:a.C+r.cnt.C, K:a.K+r.cnt.K }), {a2:0,a1:0,a0:0,SB:0,B:0,C:0,K:0});
    const sj = skorLKPS({SB:t.SB,B:t.B,C:t.C,K:t.K});
    rows.push(['Jumlah','','','',t.a2,t.a1,t.a0,'','','',t.SB,t.B,t.C,t.K, sj==='–'?'-':Number(sj),'']);
  }

  return {
    rows,
    merges: [
      { s:{r:0,c:0}, e:{r:0,c:15} }, { s:{r:1,c:0}, e:{r:1,c:15} },
      { s:{r:2,c:0}, e:{r:3,c:0} },  { s:{r:2,c:1}, e:{r:3,c:1} },
      { s:{r:2,c:2}, e:{r:2,c:3} },  { s:{r:2,c:4}, e:{r:2,c:6} },
      { s:{r:2,c:7}, e:{r:2,c:9} },  { s:{r:2,c:10}, e:{r:2,c:13} },
      { s:{r:2,c:14}, e:{r:3,c:14} },{ s:{r:2,c:15}, e:{r:3,c:15} },
    ],
    cols: [{wch:5},{wch:20},{wch:8},{wch:9},{wch:8},{wch:8},{wch:8},{wch:9},{wch:9},{wch:9},{wch:6},{wch:6},{wch:6},{wch:6},{wch:8},{wch:40}],
  };
}

// Bangun lembar Tabel 2.7B persis template resmi LKPS (dipakai di exportLKPSExcel).
// Angka persentase ditulis sebagai angka (bukan teks) dan kolom 7 / baris Jumlah
// memakai RUMUS yang sama dengan template: G = SUM(C:F), C..F Jumlah = SUM(aspek 1–7).
function build27BSheet(XLSX, c27b) {
  const aoa = [];
  aoa.push(['Tabel 2.7B Kepuasan Pengguna Lulusan']);
  aoa.push(['Diisi oleh pengusul dari Program Studi Manajemen Sumber Daya Perairan (MSP) FPIK UNSRAT']);
  aoa.push(['Tahun Lulus','Jumlah Lulusan','Jumlah Tanggapan Kepuasan Pengguna yang Terlacak']);
  aoa.push([1, 2, 3]);
  const aStart = aoa.length;
  c27b.partA.forEach(r => aoa.push([r.label, parseInt(r.jumlahLulusan)||0, r.tanggapan]));
  const aEnd = aoa.length - 1;
  aoa.push(['Jumlah', c27b.totalLulusan, c27b.totalTanggapan]);
  const aSumRow = aoa.length - 1;
  aoa.push([]);
  const hIdx = aoa.length;
  aoa.push(['No','Jenis Kemampuan','Tingkat Kepuasan Pengguna (%)','','','','Jumlah Persentase Kepuasan Pengguna (%)','Rencana Tindak Lanjut oleh UPPS/PS']);
  aoa.push(['','','Sangat Baik','Baik','Cukup','Kurang','','']);
  aoa.push([1, 2, 3, 4, 5, 6, 7, 8]);
  const bStart = aoa.length;
  c27b.partB.forEach(r => aoa.push([r.no, r.label, r.pSB, r.pB, r.pC, r.pK, r.pKepuasan, r.rtl]));
  const bEnd = aoa.length - 1;
  aoa.push(['Jumlah','', c27b.jumlahRow.pSB, c27b.jumlahRow.pB, c27b.jumlahRow.pC, c27b.jumlahRow.pK, '', '']);
  const bSumRow = aoa.length - 1;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const addr = (r, c) => XLSX.utils.encode_cell({ r, c });
  const setF = (r, c, f) => { const cell = ws[addr(r, c)] || (ws[addr(r, c)] = { t:'n', v:0 }); cell.f = f; };

  // Bagian atas: Jumlah = SUM
  const xa = aStart + 1, xb = aEnd + 1;
  setF(aSumRow, 1, `SUM(B${xa}:B${xb})`);
  setF(aSumRow, 2, `SUM(C${xa}:C${xb})`);

  // Bagian bawah: kolom 7 tiap aspek = SUM(C:F); baris Jumlah kolom 3–6 = SUM aspek 1–7
  for (let r = bStart; r <= bEnd; r++) setF(r, 6, `SUM(C${r+1}:F${r+1})`);
  ['C','D','E','F'].forEach((col, i) => setF(bSumRow, 2 + i, `SUM(${col}${bStart+1}:${col}${bEnd+1})`));

  ws['!merges'] = [
    { s:{r:0,c:0}, e:{r:0,c:7} }, { s:{r:1,c:0}, e:{r:1,c:7} },
    { s:{r:hIdx,c:2}, e:{r:hIdx,c:5} },
    { s:{r:hIdx,c:0}, e:{r:hIdx+1,c:0} }, { s:{r:hIdx,c:1}, e:{r:hIdx+1,c:1} },
    { s:{r:hIdx,c:6}, e:{r:hIdx+1,c:6} }, { s:{r:hIdx,c:7}, e:{r:hIdx+1,c:7} },
    { s:{r:bSumRow,c:0}, e:{r:bSumRow,c:1} },
  ];
  ws['!cols'] = [{wch:6},{wch:38},{wch:12},{wch:10},{wch:10},{wch:10},{wch:16},{wch:50}];
  return ws;
}

// ════════════════════════════════════════════════════════
//  EXPORT — Tabel LKPS LAM PTIP (2.7B · 2.7C · 2.8B1 · 2.8B2)
//  Format & susunan kolom mengikuti template resmi LKPS IAPS 1.0
// ════════════════════════════════════════════════════════
export async function exportLKPSExcel() {
  if (!isLoggedIn()) return alert('Silakan login terlebih dahulu.');
  const { al, em, sk } = await getData();
  await loadAllLkpsConfig();
  if (!al.length && !em.length) return alert('Belum ada data.');

  const XLSX  = await ensureXLSX();
  const wb    = XLSX.utils.book_new();
  const c27b  = compute27B(em, al);
  const c28b1 = compute28B1(al);
  const c28b2 = compute28B2(al);

  // ── Sheet Tabel 2.7B ──
  XLSX.utils.book_append_sheet(wb, build27BSheet(XLSX, c27b), 'Tabel 2.7B');

  // ── Sheet Tabel 2.7C ──
  const c27c = build27CAOA(sk || []);
  const ws27c = XLSX.utils.aoa_to_sheet(c27c.rows);
  ws27c['!merges'] = c27c.merges;
  ws27c['!cols']   = c27c.cols;
  XLSX.utils.book_append_sheet(wb, ws27c, 'Tabel 2.7C');

  // ── Sheet Tabel 2.8B1 ──
  const aoa28b1 = [];
  aoa28b1.push(['Tabel 2.8B1 Waktu Tunggu Lulusan']);
  aoa28b1.push(['Diisi oleh pengusul dari Program Studi Manajemen Sumber Daya Perairan (MSP) FPIK UNSRAT']);
  aoa28b1.push(['Tahun Lulus','Jumlah Lulusan','Jumlah Lulusan yang Terlacak','Jumlah Lulusan Terlacak dengan Waktu Tunggu Mendapatkan Pekerjaan','','']);
  aoa28b1.push(['','','','WT < 6 bulan','6 ≤ WT ≤ 18 bulan','WT > 18 bulan']);
  c28b1.rows.forEach(r => aoa28b1.push([r.label, parseInt(r.jumlahLulusan)||0, r.terlacak, r.lt6, r.mid, r.gt18]));
  aoa28b1.push(['Jumlah', c28b1.totLulusan, c28b1.totTerlacak, c28b1.totLt6, c28b1.totMid, c28b1.totGt18]);
  const ws28b1 = XLSX.utils.aoa_to_sheet(aoa28b1);
  ws28b1['!merges'] = [
    { s:{r:0,c:0}, e:{r:0,c:5} }, { s:{r:1,c:0}, e:{r:1,c:5} },
    { s:{r:2,c:0}, e:{r:3,c:0} }, { s:{r:2,c:1}, e:{r:3,c:1} }, { s:{r:2,c:2}, e:{r:3,c:2} },
    { s:{r:2,c:3}, e:{r:2,c:5} },
  ];
  ws28b1['!cols'] = [{wch:12},{wch:14},{wch:14},{wch:14},{wch:16},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws28b1, 'Tabel 2.8B1');

  // ── Sheet Tabel 2.8B2 ──
  const aoa28b2 = [];
  aoa28b2.push(['Tabel 2.8B2 Tempat Kerja Lulusan']);
  aoa28b2.push(['Diisi oleh pengusul status Terakreditasi UNGGUL — Program Studi Manajemen Sumber Daya Perairan (MSP) FPIK UNSRAT']);
  aoa28b2.push(['Tahun Lulus','Jumlah Lulusan','Jumlah Lulusan yang Terlacak','Jumlah Lulusan Terlacak yang Bekerja Berdasarkan Tingkat/Ukuran Tempat Kerja/Berwirausaha','','']);
  aoa28b2.push(['','','','Lokal/Wilayah/Berwirausaha tidak Berbadan Hukum','Nasional/Berwirausaha Berbadan Hukum','Multinasional/Internasional']);
  c28b2.rows.forEach(r => aoa28b2.push([r.label, parseInt(r.jumlahLulusan)||0, r.terlacak, r.lok, r.nas, r.multi]));
  aoa28b2.push(['Jumlah', c28b2.totLulusan, c28b2.totTerlacak, c28b2.totLok, c28b2.totNas, c28b2.totMulti]);
  const ws28b2 = XLSX.utils.aoa_to_sheet(aoa28b2);
  ws28b2['!merges'] = [
    { s:{r:0,c:0}, e:{r:0,c:5} }, { s:{r:1,c:0}, e:{r:1,c:5} },
    { s:{r:2,c:0}, e:{r:3,c:0} }, { s:{r:2,c:1}, e:{r:3,c:1} }, { s:{r:2,c:2}, e:{r:3,c:2} },
    { s:{r:2,c:3}, e:{r:2,c:5} },
  ];
  ws28b2['!cols'] = [{wch:12},{wch:14},{wch:14},{wch:22},{wch:20},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws28b2, 'Tabel 2.8B2');

  // ── Sheet data mentah pendukung ──
  if (al.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alRawRows(al)), 'Data Alumni');
  if (em.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(emRawRows(em)), 'Data Pengguna Lulusan');

  XLSX.writeFile(wb, `Tabel_LKPS_2.7B_2.7C_2.8B1_2.8B2_MSP_FPIK_UNSRAT_${new Date().toISOString().slice(0,10)}.xlsx`);
}
window._exportLKPSExcel = exportLKPSExcel;

// ════════════════════════════════════════════════════════
//  EXPORT — Excel per bagian (Ringkasan / Alumni / Pengguna / Stakeholder)
// ════════════════════════════════════════════════════════
export async function exportSectionExcel(section) {
  if (!isLoggedIn()) return alert('Silakan login terlebih dahulu.');
  const { al, em, sk } = await getData();
  const XLSX = await ensureXLSX();
  const wb   = XLSX.utils.book_new();
  let fname  = 'Data';

  if (section === 'alumni') {
    if (!al.length) return alert('Belum ada data alumni.');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alRawRows(al)), 'Data Alumni');
    fname = 'Data_Alumni';
  } else if (section === 'employer') {
    if (!em.length) return alert('Belum ada data pengguna lulusan.');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(emRawRows(em)), 'Pengguna Lulusan');
    fname = 'Data_PenggunaLulusan';
  } else if (section === 'stakeholder') {
    if (!sk.length) return alert('Belum ada data stakeholder.');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skRawRows(sk)), 'Stakeholder');
    fname = 'Data_Stakeholder';
  } else if (section === 'ringkasan') {
    const bekerja    = al.filter(isBekerja).length;
    const pctKerja   = al.length ? Math.round(bekerja/al.length*100) : 0;
    const relevan    = al.filter(a=>['Sangat Erat','Erat'].includes(a.kesesuaian)).length;
    const pctRelevan = bekerja ? Math.round(relevan/bekerja*100) : 0;
    const avg7       = avgRtg(em, ['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
    const avgProdi   = avgRtg(al, ['rtg_ar1','rtg_ar2','rtg_ar3','rtg_ar4','rtg_ar5','rtg_ar6','rtg_ar7']);
    const summary = [
      { Indikator:'Total Respons Alumni', Nilai: al.length },
      { Indikator:'Total Respons Instansi/Pengguna Lulusan', Nilai: em.length },
      { Indikator:'% Lulusan Bekerja', Nilai: pctKerja+'%' },
      { Indikator:'% Kerja Relevan dengan Bidang Studi', Nilai: pctRelevan+'%' },
      { Indikator:'Rata-rata 7 Aspek Kepuasan Pengguna (Tabel 2.7B)', Nilai: avg7 },
      { Indikator:'Rata-rata Penilaian Prodi oleh Alumni', Nilai: avgProdi },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Ringkasan');
    fname = 'Ringkasan_Statistik';
  } else {
    return;
  }

  XLSX.writeFile(wb, `${fname}_MSP_FPIK_UNSRAT_${new Date().toISOString().slice(0,10)}.xlsx`);
}
window._exportSectionExcel = exportSectionExcel;

// ════════════════════════════════════════════════════════
//  EXPORT EXCEL LENGKAP (.xlsx) — semua data & tabel LKPS
// ════════════════════════════════════════════════════════
export async function exportExcel() {
  if (!isLoggedIn()) return alert('Silakan login terlebih dahulu.');
  const { al, em, sk } = await getData();
  await loadAllLkpsConfig();
  if (!al.length && !em.length) return alert('Belum ada data.');

  const XLSX = await ensureXLSX();
  const wb   = XLSX.utils.book_new();

  if (al.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alRawRows(al)), 'Data Alumni');
  if (em.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(emRawRows(em)), 'Pengguna Lulusan');
  if (sk && sk.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skRawRows(sk)), 'Stakeholder');

  const c27b  = compute27B(em, al);
  const t27b  = c27b.partB.map(r => ({ 'No':r.no, 'Aspek Kompetensi':r.label, 'Sangat Baik(%)':r.pSB, 'Baik(%)':r.pB, 'Cukup(%)':r.pC, 'Kurang(%)':r.pK, 'Jumlah % Kepuasan':r.pKepuasan, 'Rencana Tindak Lanjut':r.rtl }));
  t27b.push({ 'No':'Jumlah', 'Aspek Kompetensi':'', 'Sangat Baik(%)':c27b.jumlahRow.pSB, 'Baik(%)':c27b.jumlahRow.pB, 'Cukup(%)':c27b.jumlahRow.pC, 'Kurang(%)':c27b.jumlahRow.pK, 'Jumlah % Kepuasan':'', 'Rencana Tindak Lanjut':'' });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t27b), 'Tabel 2.7B LAM');

  const c28b1 = compute28B1(al);
  const t28b1 = c28b1.rows.map(r => ({ 'Tahun Lulus':`${r.label} (${r.year})`, 'Jumlah Lulusan':r.jumlahLulusan||0, 'Terlacak':r.terlacak, 'WT<6 bln':r.lt6, '6≤WT≤18 bln':r.mid, 'WT>18 bln':r.gt18 }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t28b1), 'Tabel 2.8B1 WT');

  const c28b2 = compute28B2(al);
  const t28b2 = c28b2.rows.map(r => ({ 'Tahun Lulus':`${r.label} (${r.year})`, 'Jumlah Lulusan':r.jumlahLulusan||0, 'Terlacak':r.terlacak, 'Lokal':r.lok, 'Nasional':r.nas, 'Multinasional':r.multi }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t28b2), 'Tabel 2.8B2 TK');

  XLSX.writeFile(wb, `Laporan_SurveiMutu_MSP_FPIK_UNSRAT_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ════════════════════════════════════════════════════════
//  EXPORT WORD (.docx) — menggunakan docx.js CDN
// ════════════════════════════════════════════════════════
export async function exportWord() {
  if (!isLoggedIn()) return alert('Silakan login terlebih dahulu.');
  const { al, em } = await getData();
  await loadAllLkpsConfig();

  // Load docx library
  if (!window.docx) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      // build/index.js tidak ada di docx@8.5.0 (404) → pakai build UMD yang membuat window.docx
      s.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const { Document, Paragraph, Table, TableRow, TableCell,
          TextRun, HeadingLevel, AlignmentType, WidthType,
          BorderStyle, Packer } = window.docx;

  const tgl   = new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  const avg7  = avgRtg(em,['rtg_er1','rtg_er2','rtg_er3','rtg_er4','rtg_er5','rtg_er6','rtg_er7']);
  // Angka 2.8B1/2.8B2 diambil dari perhitungan yang sama dengan tabel LKPS (kohort TS-4 s.d. TS-2)
  const w81   = compute28B1(al);
  const w82   = compute28B2(al);
  const lt6   = w81.totLt6;
  const pctLt6= w81.pctLt6;
  const pctOf = (n, t) => t ? Math.round(n / t * 100) + '%' : '-';

  // Helper buat baris tabel
  const mkRow = (cells, bold=false) => new TableRow({
    children: cells.map(c => new TableCell({
      children: [new Paragraph({ children:[new TextRun({text:String(c),bold,size:20})] })],
      width:{ size: Math.floor(9000/cells.length), type: WidthType.DXA }
    }))
  });

  // Tabel 2.7B rows — format & rumus sama dengan template LKPS (compute27B)
  const c27b    = compute27B(em, al);
  const rows27b = c27b.partB.map(r => mkRow([r.no, r.label, r.pSB+'%', r.pB+'%', r.pC+'%', r.pK+'%', r.pKepuasan+'%']));
  rows27b.push(mkRow(['Jumlah', '', c27b.jumlahRow.pSB+'%', c27b.jumlahRow.pB+'%', c27b.jumlahRow.pC+'%', c27b.jumlahRow.pK+'%', ''], true));

  // Ambil narasi dari kotak "Analisis dan Pembahasan" (abaikan pesan error/keterangan AI)
  const narEl = document.getElementById('narasi-content');
  const narBlocks = narEl ? [...narEl.querySelectorAll('h4, p')].filter(el => !el.closest('.info-box') && !/Narasi dibuat otomatis/i.test(el.textContent)) : [];
  let narTexts = narBlocks.map(el => ({ t: el.textContent.trim(), h: el.tagName === 'H4' })).filter(x => x.t);
  if (!narTexts.length && narEl && narEl.innerText.trim() && !narEl.querySelector('.info-box'))
    narTexts = narEl.innerText.split(/\n{2,}/).map(t => ({ t: t.trim(), h: false })).filter(x => x.t);
  const narasiParas = narTexts.length
    ? narTexts.map(x => new Paragraph({ children:[new TextRun({ text:x.t, bold:x.h, size:22 })], spacing:{ after:120 } }))
    : [new Paragraph({ children:[new TextRun({ text:'(Narasi belum dibuat — klik "Generate Narasi AI" atau ketik manual sebelum mengunduh Word.)', italics:true, size:20, color:'888888' })] })];

  const doc = new Document({ sections:[{ children:[
    // Kop
    new Paragraph({ text:'LAPORAN TRACER STUDY', heading:HeadingLevel.HEADING_1, alignment:AlignmentType.CENTER }),
    new Paragraph({ text:'Program Studi Manajemen Sumber Daya Perairan', heading:HeadingLevel.HEADING_2, alignment:AlignmentType.CENTER }),
    new Paragraph({ text:'Fakultas Perikanan dan Ilmu Kelautan · Universitas Sam Ratulangi', alignment:AlignmentType.CENTER, children:[new TextRun({text:'Fakultas Perikanan dan Ilmu Kelautan · Universitas Sam Ratulangi',size:22})] }),
    new Paragraph({ text:`Dicetak: ${tgl}`, alignment:AlignmentType.CENTER, children:[new TextRun({text:`Dicetak: ${tgl}`,size:20,color:'666666'})] }),
    new Paragraph(''),

    // Ringkasan
    new Paragraph({ text:'A. Ringkasan Data', heading:HeadingLevel.HEADING_2 }),
    new Paragraph({ children:[new TextRun({text:`• Total Responden Alumni       : ${al.length} orang`,size:22})] }),
    new Paragraph({ children:[new TextRun({text:`• Total Responden Instansi     : ${em.length} instansi`,size:22})] }),
    new Paragraph({ children:[new TextRun({text:`• Rata-rata 7 Aspek LAM PTIP  : ${avg7} / 4`,size:22})] }),
    new Paragraph({ children:[new TextRun({text:`• Lulusan WT < 6 bulan        : ${pctLt6}%`,size:22})] }),
    new Paragraph(''),

    // Tabel 2.7B
    new Paragraph({ text:'B. Tabel 2.7B — Kepuasan Pengguna Lulusan', heading:HeadingLevel.HEADING_2 }),
    new Table({ rows:[
      mkRow(['No','Jenis Kemampuan','Sangat Baik (%)','Baik (%)','Cukup (%)','Kurang (%)','Jumlah % Kepuasan'], true),
      ...rows27b
    ]}),
    new Paragraph(''),

    // Tabel 2.8B1
    new Paragraph({ text:'C. Tabel 2.8B1 — Waktu Tunggu Lulusan', heading:HeadingLevel.HEADING_2 }),
    new Table({ rows:[
      mkRow(['Kategori Waktu Tunggu','Jumlah','Persentase'], true),
      mkRow(['WT < 6 bulan', lt6, pctLt6+'%']),
      mkRow(['6 ≤ WT ≤ 18 bulan', w81.totMid, pctOf(w81.totMid, w81.totTerlacak)]),
      mkRow(['WT > 18 bulan', w81.totGt18, pctOf(w81.totGt18, w81.totTerlacak)]),
    ]}),
    new Paragraph(''),

    // Tabel 2.8B2
    new Paragraph({ text:'D. Tabel 2.8B2 — Tingkat Tempat Kerja', heading:HeadingLevel.HEADING_2 }),
    new Table({ rows:[
      mkRow(['Tingkat Tempat Kerja','Jumlah','Persentase'], true),
      mkRow(['Lokal/Wilayah/Wirausaha', w82.totLok, pctOf(w82.totLok, w82.totTerlacak)]),
      mkRow(['Nasional/Berbadan Hukum', w82.totNas, pctOf(w82.totNas, w82.totTerlacak)]),
      mkRow(['Multinasional/Internasional', w82.totMulti, pctOf(w82.totMulti, w82.totTerlacak)]),
    ]}),
    new Paragraph(''),

    // Analisis & Pembahasan — teks dari kotak narasi (hasil Generate AI atau ketikan manual)
    new Paragraph({ text:'E. Analisis dan Pembahasan', heading:HeadingLevel.HEADING_2 }),
    ...narasiParas,
  ]}]});

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`Laporan_SurveiMutu_MSP_FPIK_UNSRAT_${new Date().toISOString().slice(0,10)}.docx`;
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

// ── Expose semua ke HTML
window._exportCSV    = exportCSV;
window._exportExcel  = exportExcel;
window._exportWord   = async () => {
  try { await exportWord(); }
  catch (e) { alert('Gagal membuat file Word: ' + (e?.message || 'pustaka Word tidak bisa dimuat. Periksa koneksi internet lalu coba lagi.')); }
};
window._exportPDF    = exportPDF;
window._printLaporan = printLaporan;

// ════════════════════════════════════════════════════════
//  CHART HELPERS
// ════════════════════════════════════════════════════════
// Label nilai di grafik: persentase terhadap total, 2 angka desimal + satuan %
function pctLabel(v, ctx) {
  if (!v) return '';
  const tot = ctx.dataset.data.reduce((s, x) => s + (Number(x) || 0), 0);
  return tot ? (v / tot * 100).toFixed(2) + '%' : '';
}

function dChart(id) { if(charts[id]){charts[id].destroy();delete charts[id];} }

function mkChart(id, type, dataMap) {
  dChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type,
    data:{labels:Object.keys(dataMap),datasets:[{data:Object.values(dataMap),backgroundColor:CHART_COLORS,borderWidth:0,borderRadius:type==='bar'?4:0}]},
    options:{responsive:true,maintainAspectRatio:false,
      layout:type==='bar'?{padding:{top:22}}:undefined,
      plugins:{legend:{display:type!=='bar',position:'right',labels:{font:{size:10},padding:8,boxWidth:10}},
        datalabels: type==='bar'
          ? { display:true, anchor:'end', align:'end', color:'#003D5B', font:{weight:'bold',size:11}, formatter:pctLabel }
          : { display:true, color:'#fff', font:{weight:'bold',size:11}, formatter:pctLabel }
      },
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
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',layout:{padding:{right:40}},
      plugins:{legend:{display:false},
        datalabels:{ display:true, anchor:'end', align:'end', color:'#111', font:{weight:'bold',size:11}, formatter:(v)=>v>0?Number(v).toFixed(2):'' }
      },
      scales:{x:{min:0,max:4,ticks:{stepSize:1}},y:{ticks:{font:{size:9}}}}}
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
