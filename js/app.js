/**
 * app.js — SPA Router & Render Halaman SIMANDES.
 * Prinsip gas-instant-ux-pro yang diterapkan:
 *  - Router hash (#/halaman), halaman di-render sekali lalu show/hide (tanpa rebuild DOM).
 *  - SWR: cache lokal tampil instan, revalidasi di latar belakang.
 *  - Bootstrap satu panggilan per layar (bukan beberapa fetch berurutan).
 *  - Filter & pencarian rekap didebounce di sisi klien.
 */
const MENU = [
  { key:'dashboard', label:'Dashboard', num:'01', roles:['SEKDES','KADES','SUPERADMIN'] },
  { key:'input', label:'Input Realisasi SPJ', num:'02', roles:['SEKDES','SUPERADMIN'] },
  { key:'rekap', label:'Rekap & Laporan', num:'03', roles:['SEKDES','KADES','SUPERADMIN'] },
  { key:'approval', label:'Verifikasi & Approval', num:'04', roles:['KADES','SUPERADMIN'] },
  { key:'pengaturan', label:'Pengaturan & Admin', num:'05', roles:['SEKDES','SUPERADMIN'] },
];

function renderShell(){
  const ses = Session.get();
  const root = document.getElementById('root');
  if (!ses){ renderLogin(root); return; }

  root.innerHTML = `
    <div id="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="logo-box">SM</div>
          <div><div class="name">SIMANDES 2026</div><div class="desa">Desa Puspahiang, Kec. Puspahiang</div></div>
        </div>
        <span class="badge-kode">KODE: 32.06.14.2001</span>
        <div class="nav-group-label">Modul Utama</div>
        <div id="nav-list"></div>
        <div class="sidebar-foot"><span class="dot-online"></span> Online &bull; Audit Strict</div>
      </aside>
      <div class="main">
        <div class="topbar">
          <div class="flex gap-sm">
            <button class="btn btn-ghost mobile-nav-toggle" id="btn-burger">&#9776;</button>
            <span class="crumb" id="crumb">SIMANDES / KEC_PUSPAHIANG / DESA_PUSPAHIANG</span>
          </div>
          <div class="topbar-right">
            <span class="chip" id="chip-role"></span>
            <div class="avatar" id="avatar"></div>
          </div>
        </div>
        <div class="content" id="content">
          <div id="page-dashboard" class="page"></div>
          <div id="page-input" class="page"></div>
          <div id="page-rekap" class="page"></div>
          <div id="page-approval" class="page"></div>
          <div id="page-pengaturan" class="page"></div>
        </div>
      </div>
    </div>`;

  document.getElementById('chip-role').textContent = 'ROLE: ' + ses.profil.role;
  document.getElementById('avatar').textContent = (ses.profil.nama || '?').slice(0,1).toUpperCase();
  document.getElementById('btn-burger').onclick = () => document.getElementById('sidebar').classList.toggle('open');

  const navList = document.getElementById('nav-list');
  navList.innerHTML = MENU.filter(m => m.roles.includes(ses.profil.role)).map(m =>
    `<div class="nav-item" data-go="${m.key}"><span>${m.label}</span><span class="n">${m.num}</span></div>`).join('');
  navList.querySelectorAll('.nav-item').forEach(el => el.onclick = () => { location.hash = '#/' + el.dataset.go; document.getElementById('sidebar').classList.remove('open'); });

  router();
}

function setActiveNav(key){
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.go === key));
}
function showPage(key){
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('page-' + key);
  if (el) el.classList.add('active');
}

async function router(){
  const ses = Session.get();
  const hash = (location.hash || '#/dashboard').replace('#/', '');
  const [page] = hash.split('?');

  if (!ses){ renderLogin(document.getElementById('root')); return; }
  if (!document.getElementById('app-shell')){ renderShell(); return; }

  const allowed = MENU.find(m => m.key === page && m.roles.includes(ses.profil.role));
  const target = allowed ? page : 'dashboard';
  setActiveNav(target); showPage(target);

  const renderers = { dashboard: renderDashboard, input: renderInput, rekap: renderRekap, approval: renderApproval, pengaturan: renderPengaturan };
  renderers[target] && renderers[target]();
}
window.addEventListener('hashchange', router);

// ===================== LOGIN =====================
function renderLogin(root){
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="logo-box">SM</div>
      <h1>SIMANDES</h1>
      <div class="sub">Sistem Informasi Monitoring Anggaran Desa Puspahiang — TA 2026</div>
      <div id="login-error" class="login-error hidden"></div>
      <form id="form-login">
        <div class="field"><label>Email Akun Google Desa</label><input type="email" id="login-email" placeholder="nama@puspahiang.desa.id" required></div>
        <div class="field"><label>Kata Sandi</label><input type="password" id="login-password" required></div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" type="submit" id="btn-login">Masuk</button>
      </form>
      <p class="hint" style="margin-top:1rem;text-align:center">Akses terbatas &amp; diaudit ketat. Hanya untuk Kepala Desa dan Sekretaris Desa terdaftar.</p>
    </div>
  </div>`;
  document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'Memeriksa...';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const res = await apiPost('login', { email, password });
    btn.disabled = false; btn.textContent = 'Masuk';
    const errEl = document.getElementById('login-error');
    if (!res.success){ errEl.textContent = res.message; errEl.classList.remove('hidden'); return; }
    Session.set({ token: res.token, profil: res.profil });
    Store.set('dashboard', res.dashboard);
    location.hash = '#/dashboard';
    renderShell();
  };
}
function logout(){ Session.clear(); localStorage.clear(); location.hash = '#/login'; location.reload(); }

// ===================== DASHBOARD =====================
function renderDashboard(){
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `<div id="dash-body"><div class="stat-grid">${skeletons(4)}</div><div class="card"><div class="card-body skel" style="height:260px"></div></div></div>`;
  swr('dashboard', 60000, () => apiGet('bootstrapDashboard'), (data, stale, err) => {
    if (!data){ el.querySelector('#dash-body').innerHTML = errBox(err); return; }
    const a = data.agregasi;
    el.querySelector('#dash-body').innerHTML = `
      <div class="stat-grid">
        ${statCard('01 / TOTAL PAGU INDIKATIF', rupiah(a.totalPagu), 'Plafon total 6 Bidang APBDes')}
        ${statCard('02 / TOTAL REALISASI', rupiah(a.totalRealisasi), 'Akumulasi realisasi terverifikasi')}
        ${statCard('03 / SISA PAGU ANGGARAN', rupiah(a.sisaAnggaran), 'Kapasitas tersedia s.d. saat ini')}
        ${statCard('04 / RASIO PENYERAPAN', persen(a.persenSerap), 'Realisasi dibagi pagu murni')}
      </div>
      <div class="card">
        <div class="card-head"><span class="title">Fig. 01 // Komparasi Pagu vs Realisasi per Bidang</span></div>
        <div class="card-body">${a.perBidang.map(b => barRow(b)).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><span class="title">Realisasi Terbaru APBDes 2026</span></div>
        <div class="card-body table-wrap">
          <table class="ledger"><thead><tr><th>Tanggal</th><th>Kode</th><th>Uraian</th><th class="num">Nominal</th><th>Sumber Dana</th><th>Status</th></tr></thead>
          <tbody>${data.realisasiTerbaru.map(r => `<tr>
            <td>${tanggalID(r.tanggal_input)}</td><td>${r.kode_kegiatan}</td><td>${esc(r.uraian_realisasi)}</td>
            <td class="num tnum">${rupiah(r.nominal)}</td><td>${esc(r.sumber_dana)}</td><td>${badge(r.status)}</td>
          </tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada data realisasi.</td></tr>'}</tbody></table>
        </div>
      </div>`;
  });
}
function barRow(b){
  const pct = b.pagu ? Math.min(100, b.realisasi / b.pagu * 100) : 0;
  return `<div style="margin-bottom:.9rem">
    <div class="flex justify-between" style="font-size:12px"><b>${esc(b.kode)}. ${esc(b.nama)}</b><span class="tnum muted">${rupiah(b.realisasi)} / ${rupiah(b.pagu)} (${persen(pct)})</span></div>
    <div class="progress"><span style="width:${pct}%"></span></div>
  </div>`;
}
function statCard(label, value, sub){ return `<div class="stat-card"><div class="label">${label}</div><div class="value tnum">${value}</div><div class="sub">${sub}</div></div>`; }
function skeletons(n){ return Array(n).fill('<div class="stat-card skel" style="height:86px"></div>').join(''); }
function errBox(msg){ return `<div class="card"><div class="card-body"><div class="login-error">${esc(msg || 'Gagal memuat data.')}</div></div></div>`; }
function badge(status){
  const map = { 'Disetujui':'badge-disetujui', 'Draft':'badge-draft', 'Menunggu Review':'badge-review', 'Perlu Revisi':'badge-revisi' };
  return `<span class="badge ${map[status] || 'badge-draft'}">${esc(status || '-')}</span>`;
}
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ===================== INPUT REALISASI =====================
let _inputKegiatan = [];
function renderInput(){
  const el = document.getElementById('page-input');
  el.innerHTML = `<div class="card"><div class="card-body skel" style="height:420px"></div></div>`;
  swr('input', 30000, () => apiGet('bootstrapInput'), (data, stale, err) => {
    if (!data){ el.innerHTML = errBox(err); return; }
    _inputKegiatan = data.kegiatan;
    const bidangSet = [...new Set(data.kegiatan.map(k => k.kodeBidang))];
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><span class="title">Formulir Input Realisasi Anggaran</span></div>
        <div class="card-body">
          <form id="form-input">
            <div class="grid2">
              <div class="field"><label>Bidang APBDes</label>
                <select id="in-bidang" required><option value="">Pilih bidang</option>${bidangSet.map(b => `<option value="${b}">[${b}] ${esc(_inputKegiatan.find(k=>k.kodeBidang===b).namaBidang)}</option>`).join('')}</select>
              </div>
              <div class="field"><label>Sub Bidang / Kegiatan</label><select id="in-kegiatan" required disabled><option value="">Pilih bidang dahulu</option></select></div>
            </div>
            <div class="card" style="background:var(--substrate);border-style:dashed" id="in-info"></div>
            <div class="field"><label>Uraian Realisasi Pembayaran (SPJ)</label><textarea id="in-uraian" required placeholder="mis. Pembangunan Rabat Beton Segmen 2 Kp. Cisalopa RT 04/02"></textarea></div>
            <div class="grid2">
              <div class="field"><label>Volume Realisasi Berjalan</label><input type="number" id="in-volume" min="0" step="any" required></div>
              <div class="field"><label>Nominal Realisasi (Rp)</label><input type="number" id="in-nominal" min="1" step="1" required></div>
            </div>
            <div class="grid2">
              <div class="field"><label>Sumber Dana Kas Desa</label>
                <select id="in-sumber" required>${data.sumberDana.map(s => `<option>${s}</option>`).join('')}</select>
              </div>
              <div class="field"><label>Referensi No. SPJ (opsional)</label><input type="text" id="in-nospj" placeholder="mis. 041/SPJ-PEMB/III/2026"></div>
            </div>
            <div id="in-warning"></div>
            <div class="flex gap-sm justify-between" style="margin-top:1rem">
              <button type="button" class="btn btn-ghost" id="btn-batal-input">Batalkan Entri</button>
              <button type="submit" class="btn btn-primary">Kirim untuk Review Kepala Desa</button>
            </div>
          </form>
        </div>
      </div>`;

    const selBidang = document.getElementById('in-bidang');
    const selKegiatan = document.getElementById('in-kegiatan');
    selBidang.onchange = () => {
      const list = _inputKegiatan.filter(k => k.kodeBidang === selBidang.value);
      selKegiatan.disabled = false;
      selKegiatan.innerHTML = `<option value="">Pilih kegiatan</option>` + list.map(k => `<option value="${k.kodeKegiatan}">[${k.kodeKegiatan}] ${esc(k.namaKegiatan)}</option>`).join('');
      document.getElementById('in-info').innerHTML = '';
    };
    selKegiatan.onchange = () => renderInfoKegiatan(selKegiatan.value);
    document.getElementById('in-nominal').oninput = debounce(() => renderInfoKegiatan(selKegiatan.value), 200);
    document.getElementById('btn-batal-input').onclick = () => document.getElementById('form-input').reset();
    document.getElementById('form-input').onsubmit = submitInputRealisasi;
  });
}
function renderInfoKegiatan(kode){
  const info = document.getElementById('in-info');
  const k = _inputKegiatan.find(x => x.kodeKegiatan === kode);
  if (!k){ info.innerHTML = ''; return; }
  const nominal = Number(document.getElementById('in-nominal').value) || 0;
  const sisaSetelahInput = k.sisaPagu - nominal;
  const lebih = sisaSetelahInput < 0;
  info.innerHTML = `
    <div class="card-body" style="padding:.75rem 1rem">
      <div class="grid2">
        <div><div class="label muted" style="font-size:11px">PAGU INDIKATIF</div><div class="tnum" style="font-weight:600">${rupiah(k.paguIndikatif)}</div></div>
        <div><div class="label muted" style="font-size:11px">SISA PAGU BERJALAN</div><div class="tnum" style="font-weight:600">${rupiah(k.sisaPagu)}</div></div>
      </div>
      <div class="muted" style="font-size:12px;margin-top:.4rem">Satuan Output: ${esc(k.satuanOutput)} &bull; Kode Output: ${esc(k.kodeOutput)}</div>
      ${lebih ? `<div class="login-error" style="margin-top:.6rem">⚠️ Peringatan: nominal ini melebihi sisa pagu kegiatan sebesar ${rupiah(Math.abs(sisaSetelahInput))}. Anda tetap dapat melanjutkan, namun mohon verifikasi ulang dokumen SPJ.</div>` : ''}
    </div>`;
}
async function submitInputRealisasi(e){
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  const payload = {
    kodeKegiatan: document.getElementById('in-kegiatan').value,
    uraian: document.getElementById('in-uraian').value,
    volume: document.getElementById('in-volume').value,
    nominal: document.getElementById('in-nominal').value,
    sumberDana: document.getElementById('in-sumber').value,
    noSpj: document.getElementById('in-nospj').value
  };
  const res = await apiPost('saveRealisasi', payload);
  btn.disabled = false; btn.textContent = 'Kirim untuk Review Kepala Desa';
  toast(res.message, res.success ? 'ok' : 'err');
  if (res.success){ e.target.reset(); document.getElementById('in-kegiatan').innerHTML = '<option>Pilih bidang dahulu</option>'; document.getElementById('in-kegiatan').disabled = true;
    Store.set('dashboard', null); Store.set('input', null); Store.set('rekap', null); renderInput(); }
}

// ===================== REKAP & LAPORAN =====================
let _rekapFilter = { bidang:'', status:'', cari:'' };
function renderRekap(){
  const el = document.getElementById('page-rekap');
  el.innerHTML = `
    <div class="card">
      <div class="card-head flex justify-between">
        <span class="title">Rekap Realisasi Anggaran APBDes 2026</span>
        <div class="flex gap-sm">
          <button class="btn btn-outline btn-sm" id="btn-export-excel">Export Excel</button>
          <button class="btn btn-primary btn-sm" id="btn-export-pdf">Terbitkan Laporan PDF</button>
        </div>
      </div>
      <div class="card-body">
        <div class="grid2" style="margin-bottom:1rem">
          <input type="text" id="rk-cari" placeholder="Cari kode / nama kegiatan...">
          <div class="flex gap-sm">
            <select id="rk-bidang" style="height:36px;border:1px solid var(--axis);border-radius:4px;flex:1">
              <option value="">Semua Bidang (01-06)</option>
              <option value="01">01. Penyelenggaraan Pemerintahan Desa</option>
              <option value="02">02. Pelaksanaan Pembangunan Desa</option>
              <option value="03">03. Pembinaan Kemasyarakatan Desa</option>
              <option value="04">04. Pemberdayaan Masyarakat Desa</option>
              <option value="05">05. Penanggulangan Bencana &amp; Darurat</option>
              <option value="06">06. Pembiayaan Desa</option>
            </select>
            <select id="rk-status" style="height:36px;border:1px solid var(--axis);border-radius:4px;flex:1">
              <option value="">Semua Status</option><option>Draft</option><option>Menunggu Review</option><option>Disetujui</option><option>Perlu Revisi</option>
            </select>
          </div>
        </div>
        <div id="rk-table" class="table-wrap"><div class="skel" style="height:280px"></div></div>
      </div>
    </div>`;

  const load = () => {
    const key = 'rekap:' + JSON.stringify(_rekapFilter);
    swr(key, 20000, () => apiGet('bootstrapRekap', _rekapFilter), (data, stale, err) => {
      const host = document.getElementById('rk-table');
      if (!data){ host.innerHTML = errBox(err); return; }
      host.innerHTML = `
        <table class="ledger"><thead><tr><th>Kode</th><th>Uraian Kegiatan</th><th class="num">Pagu (Rp)</th><th class="num">Realisasi (Rp)</th><th class="num">Sisa (Rp)</th><th class="num">% Serap</th><th>Status</th></tr></thead>
        <tbody>${data.matriks.map(m => `<tr>
          <td>${esc(m.kodeKegiatan)}</td><td>${esc(m.namaKegiatan)}</td>
          <td class="num tnum">${rupiah(m.pagu)}</td><td class="num tnum">${rupiah(m.realisasi)}</td><td class="num tnum">${rupiah(m.sisa)}</td>
          <td class="num tnum">${persen(m.persenSerap)}</td><td>${badge(m.status)}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">Tidak ada data sesuai filter.</td></tr>'}</tbody>
        <tfoot><tr style="font-weight:700;background:var(--substrate)"><td colspan="2">TOTAL KONSOLIDASI</td>
          <td class="num tnum">${rupiah(data.agregasi.totalPagu)}</td><td class="num tnum">${rupiah(data.agregasi.totalRealisasi)}</td>
          <td class="num tnum">${rupiah(data.agregasi.sisaAnggaran)}</td><td class="num tnum">${persen(data.agregasi.persenSerap)}</td><td></td></tr></tfoot>
        </table>`;
    });
  };
  document.getElementById('rk-cari').oninput = debounce((e) => { _rekapFilter.cari = e.target.value; load(); });
  document.getElementById('rk-bidang').onchange = (e) => { _rekapFilter.bidang = e.target.value; load(); };
  document.getElementById('rk-status').onchange = (e) => { _rekapFilter.status = e.target.value; load(); };
  document.getElementById('btn-export-excel').onclick = async () => {
    toast('Menyiapkan file Excel...');
    const res = await apiGet('exportExcel', { bidang: _rekapFilter.bidang });
    if (res.success) window.open(res.data.url, '_blank'); else toast(res.message, 'err');
  };
  document.getElementById('btn-export-pdf').onclick = async () => {
    if (!confirm('Terbitkan Laporan LRA resmi (PDF)? Nomor surat akan dibuat permanen.')) return;
    toast('Menerbitkan laporan PDF...');
    const res = await apiPost('generateLaporan', { templateKode:'LRA', bidang: _rekapFilter.bidang });
    if (res.success){ toast('Laporan ' + res.data.nomor + ' terbit.', 'ok'); window.open(res.data.url, '_blank'); }
    else toast(res.message, 'err');
  };
  load();
}

// ===================== VERIFIKASI & APPROVAL =====================
function renderApproval(){
  const el = document.getElementById('page-approval');
  el.innerHTML = `<div class="card"><div class="card-body skel" style="height:360px"></div></div>`;
  swr('approval', 15000, () => apiGet('bootstrapApproval'), (data, stale, err) => {
    if (!data){ el.innerHTML = errBox(err); return; }
    const menunggu = data.list.filter(r => r.status === 'Menunggu Review');
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><span class="title">Antrean Verifikasi &amp; Persetujuan (${menunggu.length} Menunggu)</span></div>
        <div class="card-body table-wrap">
          <table class="ledger"><thead><tr><th>Tanggal</th><th>Kode</th><th>Uraian</th><th class="num">Nominal</th><th>Pengaju</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>${data.list.map(r => `<tr>
            <td>${tanggalID(r.tanggal)}</td><td>${esc(r.kodeKegiatan)}</td><td>${esc(r.namaKegiatan)}<div class="muted" style="font-size:11px">${esc(r.uraian)}</div></td>
            <td class="num tnum">${rupiah(r.nominal)}</td><td>${esc(r.diinputOleh)}</td><td>${badge(r.status)}</td>
            <td>${r.status === 'Menunggu Review' ? `<button class="btn btn-sm btn-primary" data-id="${r.id}" data-aksi="buka">Tinjau</button>` : '<span class="muted">—</span>'}</td>
          </tr>`).join('') || '<tr><td colspan="7" class="muted">Tidak ada data.</td></tr>'}</tbody></table>
        </div>
      </div>`;
    el.querySelectorAll('[data-aksi="buka"]').forEach(btn => btn.onclick = () => bukaModalApproval(data.list.find(r => r.id === btn.dataset.id)));
  });
}
function bukaModalApproval(r){
  const host = document.createElement('div');
  host.className = 'modal-backdrop';
  host.innerHTML = `
    <div class="modal">
      <h3>Konfirmasi Pengesahan Realisasi</h3>
      <p><b>${esc(r.id)}</b> — ${esc(r.namaKegiatan)}</p>
      <p class="muted">Nominal: <b class="tnum">${rupiah(r.nominal)}</b> &bull; Sumber: ${esc(r.sumberDana)}</p>
      <div class="field"><label>Catatan &amp; Arahan Kepala Desa</label><textarea id="ap-catatan" placeholder="Catatan (wajib jika Perlu Revisi)"></textarea></div>
      <div class="flex gap-sm justify-between" style="margin-top:1rem">
        <button class="btn btn-outline" id="ap-batal">Batal / Tinjau Kembali</button>
        <div class="flex gap-sm">
          <button class="btn btn-danger" id="ap-revisi">Kembalikan (Perlu Revisi)</button>
          <button class="btn btn-primary" id="ap-setuju">Ya, Sahkan Realisasi</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(host);
  host.querySelector('#ap-batal').onclick = () => host.remove();
  const kirim = async (status) => {
    const catatan = host.querySelector('#ap-catatan').value;
    if (status === 'Perlu Revisi' && !catatan){ toast('Catatan wajib diisi untuk status Perlu Revisi.', 'err'); return; }
    const res = await apiPost('approveRealisasi', { id: r.id, status, catatan });
    toast(res.message, res.success ? 'ok' : 'err');
    host.remove();
    if (res.success){ Store.set('approval', null); Store.set('dashboard', null); Store.set('rekap', null); renderApproval(); }
  };
  host.querySelector('#ap-setuju').onclick = () => kirim('Disetujui');
  host.querySelector('#ap-revisi').onclick = () => kirim('Perlu Revisi');
}

// ===================== PENGATURAN & ADMIN =====================
function renderPengaturan(){
  const el = document.getElementById('page-pengaturan');
  el.innerHTML = `<div class="card"><div class="card-body skel" style="height:300px"></div></div>`;
  swr('pengaturan', 60000, () => apiGet('bootstrapPengaturan'), (data, stale, err) => {
    if (!data){ el.innerHTML = errBox(err); return; }
    const p = data.pengaturan;
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><span class="title">Identitas Aplikasi &amp; Kop Laporan</span></div>
        <div class="card-body">
          <form id="form-setting">
            <div class="field"><label>Nama Aplikasi</label><input id="st-nama" value="${esc(p.nama_aplikasi)}"></div>
            <div class="grid2">
              <div class="field"><label>Warna Utama (Primary)</label><input type="color" id="st-primary" value="${p.warna_primary || '#18181B'}"></div>
              <div class="field"><label>Warna Sekunder</label><input type="color" id="st-secondary" value="${p.warna_secondary || '#71717A'}"></div>
            </div>
            <div class="grid2">
              <div class="field"><label>Nama Desa</label><input id="st-desa" value="${esc(p.nama_desa)}"></div>
              <div class="field"><label>Nama Kecamatan</label><input id="st-kec" value="${esc(p.nama_kecamatan)}"></div>
            </div>
            <div class="grid2">
              <div class="field"><label>Nama Kabupaten</label><input id="st-kab" value="${esc(p.nama_kabupaten)}"></div>
              <div class="field"><label>Nama Provinsi</label><input id="st-prov" value="${esc(p.nama_provinsi)}"></div>
            </div>
            <div class="grid2">
              <div class="field"><label>Nama Kepala Desa (Tanda Tangan)</label><input id="st-kades" value="${esc(p.nama_kepala_desa)}"></div>
              <div class="field"><label>Tahun Anggaran</label><input id="st-tahun" value="${esc(p.tahun_anggaran)}"></div>
            </div>
            <button class="btn btn-primary" type="submit">Simpan Pengaturan</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="title">Template Dokumen Cetak (Doc Engine)</span></div>
        <div class="card-body">
          <p class="muted" style="font-size:13px">Template Laporan LRA berupa Google Docs biasa. Edit kop surat, tata letak, atau tambahkan placeholder <code>{{KUNCI}}</code> baru langsung di Google Docs, lalu pindai ulang di sini agar sistem mengenali field terbaru — tanpa perlu mengubah kode program.</p>
          <div class="flex gap-sm">
            <button class="btn btn-outline" id="btn-buka-template">Buka Template di Google Docs</button>
            <button class="btn btn-primary" id="btn-scan-template">Pindai Ulang Template</button>
          </div>
          <div id="scan-result" class="muted" style="margin-top:.6rem;font-size:12px"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="title">Ganti Kata Sandi Saya</span></div>
        <div class="card-body">
          <form id="form-password">
            <div class="grid2">
              <div class="field"><label>Kata Sandi Lama</label><input type="password" id="pw-lama" required></div>
              <div class="field"><label>Kata Sandi Baru (min. 8 karakter)</label><input type="password" id="pw-baru" minlength="8" required></div>
            </div>
            <button class="btn btn-outline" type="submit">Perbarui Kata Sandi</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="title">Zona Pemeliharaan Backend (Admin)</span></div>
        <div class="card-body">
          <p class="muted" style="font-size:13px">Reset data contoh (dummy) mengembalikan sheet <code>Pagu_Indikatif</code> &amp; <code>Realisasi</code> ke data awal demo. Gunakan sebelum penggunaan rutin tahun anggaran berjalan.</p>
          <div class="field"><label>Ketik "RESET" untuk konfirmasi</label><input id="rs-konfirmasi" placeholder="RESET"></div>
          <button class="btn btn-danger" id="btn-reset-dummy">Reset Data Dummy</button>
          <hr style="margin:1.25rem 0;border:none;border-top:1px solid var(--hairline)">
          <p class="muted" style="font-size:13px">Reset kata sandi akun SUPERADMIN dari jarak jauh memerlukan <b>Kunci Reset Induk</b> (MASTER_RESET_KEY) yang hanya tersedia di Script Properties Apps Script Editor — bukan disimpan di aplikasi ini. Gunakan hanya untuk situasi darurat kehilangan akses.</p>
          <div class="grid2">
            <div class="field"><label>Kunci Reset Induk</label><input type="password" id="rs-masterkey"></div>
            <div class="field"><label>Kata Sandi Baru Superadmin</label><input type="password" id="rs-password-baru" minlength="8"></div>
          </div>
          <button class="btn btn-outline" id="btn-reset-superadmin">Reset Password Superadmin</button>
        </div>
      </div>`;

    document.getElementById('form-setting').onsubmit = async (e) => {
      e.preventDefault();
      const res = await apiPost('saveSettings', {
        namaAplikasi: v('st-nama'), warnaPrimary: v('st-primary'), warnaSecondary: v('st-secondary'),
        namaDesa: v('st-desa'), namaKecamatan: v('st-kec'), namaKabupaten: v('st-kab'), namaProvinsi: v('st-prov'),
        namaKepalaDesa: v('st-kades'), tahunAnggaran: v('st-tahun')
      });
      toast(res.message, res.success ? 'ok' : 'err');
      if (res.success) Store.set('pengaturan', null);
    };
    document.getElementById('form-password').onsubmit = async (e) => {
      e.preventDefault();
      const res = await apiPost('changePassword', { lama: v('pw-lama'), baru: v('pw-baru') });
      toast(res.message, res.success ? 'ok' : 'err');
      if (res.success) e.target.reset();
    };
    document.getElementById('btn-reset-dummy').onclick = async () => {
      const res = await apiPost('resetDummyData', { konfirmasi: v('rs-konfirmasi') });
      toast(res.message, res.success ? 'ok' : 'err');
      if (res.success){ localStorage.clear(); }
    };
    document.getElementById('btn-reset-superadmin').onclick = async () => {
      if (!confirm('Yakin reset password SUPERADMIN?')) return;
      const res = await apiPost('resetSuperadminPassword', { masterKey: v('rs-masterkey'), passwordBaru: v('rs-password-baru') });
      toast(res.message, res.success ? 'ok' : 'err');
    };
    document.getElementById('btn-scan-template').onclick = async () => {
      const res = await apiPost('scanTemplate', { kode: 'LRA' });
      document.getElementById('scan-result').textContent = res.success
        ? ('Field kustom terdeteksi: ' + (res.data.skema.length ? res.data.skema.join(', ') : '(tidak ada field kustom tambahan)'))
        : res.message;
    };
    document.getElementById('btn-buka-template').onclick = async () => {
      const res = await apiGet('getDocSchema', { kode: 'LRA' });
      if (res.success) window.open(res.data.fileUrl, '_blank'); else toast(res.message, 'err');
    };
  });
}
function v(id){ return document.getElementById(id).value; }

// ===================== BOOT =====================
document.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = '#/dashboard';
  renderShell();
});
