/**
 * api.js — Lapisan komunikasi ke backend GAS (pola gas-pro-api + gas-instant-ux-pro).
 * - fetch() murni, tanpa google.script.run.
 * - POST wajib Content-Type: text/plain;charset=utf-8 (hindari CORS preflight).
 * - SWR: tampilkan cache lokal instan, revalidasi di latar belakang jika basi.
 * - Retry otomatis utk GET saat timeout/5xx, idempotent reqId utk tulis.
 */
const Perf = { log(label, ms){ if (ms > 3000) console.warn('[LAMBAT]', label, ms + 'ms'); } };

const Store = {
  ns(key){ const email = Session.get()?.profil?.email || 'anon'; return `simandes:${APP_SCHEMA_VERSION}:u:${email}:${key}`; },
  get(key){ try { const raw = localStorage.getItem(this.ns(key)); return raw ? JSON.parse(raw) : null; } catch(e){ return null; } },
  set(key, val){ try { localStorage.setItem(this.ns(key), JSON.stringify({ t: Date.now(), val })); } catch(e){} },
  isFresh(entry, ttlMs){ return entry && (Date.now() - entry.t) < ttlMs; }
};

const Session = (function(){
  let cache = null;
  return {
    get(){ if (cache) return cache; const raw = localStorage.getItem('simandes:session'); cache = raw ? JSON.parse(raw) : null; return cache; },
    set(val){ cache = val; localStorage.setItem('simandes:session', JSON.stringify(val)); },
    clear(){ cache = null; localStorage.removeItem('simandes:session'); }
  };
})();

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16); }); }

async function apiGet(action, params = {}, { retry = 2, timeout = 25000 } = {}) {
  const t0 = performance.now();
  const ses = Session.get();
  const qs = new URLSearchParams(Object.assign({ action, token: ses?.token || '' }, params)).toString();
  for (let attempt = 0; attempt <= retry; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${GAS_URL}?${qs}`, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok && res.status >= 500) throw new Error('Server error ' + res.status);
      const json = await res.json();
      Perf.log(action, performance.now() - t0);
      if (json.code === 'AUTH_EXPIRED') { Session.clear(); location.hash = '#/login'; }
      return json;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retry) return { success: false, message: 'Gagal terhubung ke server: ' + err.message, offline: true };
    }
  }
}

async function apiPost(action, data = {}, { timeout = 90000, reqId } = {}) {
  const t0 = performance.now();
  const ses = Session.get();
  const body = JSON.stringify({ action, token: ses?.token || '', reqId: reqId || uuid(), data });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // WAJIB, hindari preflight CORS
      body
    });
    clearTimeout(timer);
    const json = await res.json();
    Perf.log(action, performance.now() - t0);
    if (json.code === 'AUTH_EXPIRED') { Session.clear(); location.hash = '#/login'; }
    return json;
  } catch (err) {
    clearTimeout(timer);
    return { success: false, message: 'Gagal mengirim data (periksa koneksi internet): ' + err.message };
  }
}

/** SWR: jalankan `render(cache)` instan, lalu revalidasi via `fetcher()` jika basi. */
async function swr(key, ttlMs, fetcher, render) {
  const cached = Store.get(key);
  if (cached) render(cached.val, true);
  if (!Store.isFresh(cached, ttlMs)) {
    const fresh = await fetcher();
    if (fresh && fresh.success) {
      const changed = JSON.stringify(fresh.data) !== JSON.stringify(cached?.val);
      Store.set(key, fresh.data);
      if (changed || !cached) render(fresh.data, false);
    } else if (!cached) {
      render(null, false, fresh?.message || 'Gagal memuat data.');
    }
  }
}

function toast(msg, type = ''){
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function rupiah(n){ return 'Rp' + Math.round(n || 0).toLocaleString('id-ID'); }
function persen(n){ return (n || 0).toFixed(2).replace('.', ',') + '%'; }
function tanggalID(iso){ try { return new Date(iso).toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' }); } catch(e){ return iso; } }
function debounce(fn, ms=280){ let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
