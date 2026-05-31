// app.js — FootJoy Vision UI controller (account-led flow)
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // Fixtures map the on-screen choice to (product category + environment),
  // which together select the criteria set. Each carries a framing tip.
  const FIXTURES = [
    { key: 'shoe-wall',   label: 'Shoe wall',        category: 'Shoes',  environment: 'Wall',
      desc: 'Main footwear display', tip: 'Stand 2-3m back and square to the wall. Fit the whole fixture in frame and avoid window glare.' },
    { key: 'dual-gender', label: 'Dual-gender wall', category: 'Shoes',  environment: 'Wall Dual Gender',
      desc: "Men's + women's",       tip: "Capture both the men's and women's zones in frame; keep the phone level." },
    { key: 'clearance',   label: 'Clearance shoes',  category: 'Shoes',  environment: 'Clearance',
      desc: 'Markdown / sale area',  tip: 'Capture the clearance bay; make sure the sale sign and a markdown price on each pair are readable.' },
    { key: 'glove-wall',  label: 'Glove wall',       category: 'Gloves', environment: 'Wall',
      desc: 'Wall-hung gloves',      tip: 'Capture the full peg run head-on; make sure sizing strips and the FJ header are readable.' },
    { key: 'glove-cart',  label: 'Glove cart',       category: 'Gloves', environment: 'Cart',
      desc: 'Counter / cart unit',   tip: 'Capture the whole cart or counter unit; keep pricing and branding in frame.' }
  ];

  const state = { user: null, account: null, fixture: null, criteria: [], blob: null, auditId: null, result: null };

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }
  function initials(name) { return (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }

  // ---------- network indicator ----------
  function net() {
    const on = navigator.onLine;
    $('netdot').classList.toggle('off', !on);
    $('netlabel').textContent = on ? 'Online' : 'Offline';
    if (on) syncQueue();
  }
  window.addEventListener('online', net);
  window.addEventListener('offline', net);

  // ---------- auth ----------
  async function boot() {
    const session = await FJV.getSession();
    if (session && session.user) { state.user = session.user; afterLogin(); }
    else show('screen-login');
    net();
    refreshSyncBadge();
  }
  $('loginBtn').addEventListener('click', async () => {
    $('loginErr').textContent = '';
    const email = $('email').value.trim(), pw = $('password').value;
    if (!email || !pw) { $('loginErr').textContent = 'Enter your email and password.'; return; }
    $('loginBtn').disabled = true;
    try { state.user = await FJV.signIn(email, pw); afterLogin(); }
    catch (e) { $('loginErr').textContent = e.message || 'Sign in failed.'; }
    finally { $('loginBtn').disabled = false; }
  });
  $('signoutBtn').addEventListener('click', async () => { await FJV.signOut(); location.reload(); });

  function afterLogin() {
    $('signoutBtn').classList.remove('hidden');
    show('screen-account');
    renderNearestPrompt();
  }

  // ---------- account selection ----------
  function renderAccounts(list, withDistance) {
    const el = $('acctList');
    if (!list.length) { el.innerHTML = '<div class="spin">No matching accounts.</div>'; return; }
    el.innerHTML = '';
    list.forEach(a => {
      const row = document.createElement('div');
      row.className = 'row';
      const dist = (withDistance && a.distance_km != null) ? `<span class="dist">${a.distance_km.toFixed(1)} km</span>` : '';
      row.innerHTML = `<div class="av">${initials(a.account_name)}</div>
        <div class="meta"><b>${esc(a.account_name)}</b><small>${esc(a.account_code)}${a.city ? ' · ' + esc(a.city) : ''}</small></div>${dist}`;
      row.addEventListener('click', () => pickAccount(a));
      el.appendChild(row);
    });
  }
  function renderNearestPrompt() { $('acctList').innerHTML = '<div class="spin">Tap "Use my location", or search above.</div>'; }

  $('locBtn').addEventListener('click', () => {
    $('acctList').innerHTML = '<div class="spin">Finding your location…</div>';
    if (!navigator.geolocation) { $('acctList').innerHTML = '<div class="spin">Location not available — use search.</div>'; return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      state.lat = pos.coords.latitude; state.lng = pos.coords.longitude;
      try { renderAccounts(await FJV.nearestAccounts(state.lat, state.lng), true); }
      catch (e) { $('acctList').innerHTML = '<div class="spin">Could not load accounts: ' + esc(e.message) + '</div>'; }
    }, () => { $('acctList').innerHTML = '<div class="spin">Location denied — use search instead.</div>'; }, { timeout: 10000 });
  });

  let searchTimer = null;
  $('acctSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length < 2) return;
    searchTimer = setTimeout(async () => {
      $('acctList').innerHTML = '<div class="spin">Searching…</div>';
      try { renderAccounts(await FJV.searchAccounts(q), false); }
      catch (err) { $('acctList').innerHTML = '<div class="spin">Search error: ' + esc(err.message) + '</div>'; }
    }, 300);
  });

  function pickAccount(a) {
    state.account = a;
    $('fixtureStore').textContent = a.account_name + ' · ' + a.account_code;
    renderFixtures();
    show('screen-fixture');
  }
  $('backToAccount').addEventListener('click', () => show('screen-account'));

  // ---------- fixture selection ----------
  function renderFixtures() {
    const el = $('fixtureGrid'); el.innerHTML = '';
    FIXTURES.forEach(f => {
      const c = document.createElement('div');
      c.className = 'tcard';
      c.innerHTML = `<div class="tn">${esc(f.label)}</div><div class="td">${esc(f.desc)}</div>`;
      c.addEventListener('click', () => pickFixture(f));
      el.appendChild(c);
    });
  }
  async function pickFixture(f) {
    state.fixture = f;
    $('captureTitle').textContent = f.label;
    $('captureTip').textContent = f.tip;
    $('preview').classList.add('hidden');
    $('scoreBtn').classList.add('hidden');
    $('retakeBtn').classList.add('hidden');
    $('takeBtn').classList.remove('hidden');
    state.blob = null;
    show('screen-capture');
    try { state.criteria = await FJV.criteriaFor(f.category, f.environment); }
    catch (e) { state.criteria = []; }
  }
  $('backToFixture').addEventListener('click', () => show('screen-fixture'));

  // ---------- capture + compress ----------
  $('takeBtn').addEventListener('click', () => $('cameraInput').click());
  $('retakeBtn').addEventListener('click', () => $('cameraInput').click());
  $('cameraInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    $('captureSpin').classList.remove('hidden');
    try {
      state.blob = await compress(file, 2560, 700 * 1024);
      const url = URL.createObjectURL(state.blob);
      $('preview').src = url; $('preview').classList.remove('hidden');
      $('takeBtn').classList.add('hidden');
      $('scoreBtn').classList.remove('hidden');
      $('retakeBtn').classList.remove('hidden');
    } finally { $('captureSpin').classList.add('hidden'); }
  });

  // Resize to maxEdge then step JPEG quality down until under maxBytes (floor 0.5).
  function compress(file, maxEdge, maxBytes) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const tryQ = (q) => canvas.toBlob((b) => {
          if (!b) { reject(new Error('compress failed')); return; }
          if (b.size <= maxBytes || q <= 0.5) resolve(b);
          else tryQ(Math.round((q - 0.07) * 100) / 100);
        }, 'image/jpeg', q);
        tryQ(0.85);
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- score (Edge Function / mock) ----------
  $('scoreBtn').addEventListener('click', async () => {
    $('captureSpin').classList.remove('hidden');
    state.auditId = crypto.randomUUID();
    try {
      const photoBase64 = await blobToBase64(state.blob);
      state.result = await FJV.evaluate({
        photo: photoBase64,
        fixture: state.fixture.label,
        criteria: state.criteria
      });
      renderReview();
      show('screen-review');
    } catch (e) {
      alert('Scoring failed: ' + e.message);
    } finally { $('captureSpin').classList.add('hidden'); }
  });

  // ---------- review (editable) ----------
  function renderReview() {
    const items = state.result.items || [];
    const byId = {}; state.criteria.forEach(c => byId[c.id] = c);
    $('reviewBanner').classList.toggle('hidden', !state.result.notes || !/mock/i.test(state.result.notes));
    if (state.result.notes && /mock/i.test(state.result.notes)) $('reviewBanner').textContent = 'Preview scores (AI function not deployed yet).';
    const list = $('critList'); list.innerHTML = '';
    items.forEach((it, idx) => {
      const c = byId[it.criterion_id] || {};
      const div = document.createElement('div'); div.className = 'crit';
      div.innerHTML = `<div class="r1"><span class="cn">${esc(c.name || 'Criterion')}</span>
        <span><span class="verdict v-${it.verdict}" data-vt>${it.verdict.toUpperCase()}</span><span class="pts" data-pt>${fmt(it.points)}/${fmt(it.max_points)}</span></span></div>
        <div class="reason">${esc(it.reason || '')}</div>
        <div class="seg">
          <button data-v="pass">Pass</button><button data-v="partial">Partial</button><button data-v="fail">Fail</button>
        </div>`;
      const seg = div.querySelector('.seg');
      const refresh = () => {
        seg.querySelectorAll('button').forEach(b => {
          b.className = (b.dataset.v === it.verdict) ? ('on ' + b.dataset.v) : '';
        });
        const vt = div.querySelector('[data-vt]');
        vt.className = 'verdict v-' + it.verdict;
        vt.textContent = it.verdict.toUpperCase();
        div.querySelector('[data-pt]').textContent = fmt(it.points) + '/' + fmt(it.max_points);
      };
      seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        it.verdict = b.dataset.v;
        const full = Number(c.full_points || it.max_points), part = Number(c.partial_points || 0);
        it.points = it.verdict === 'pass' ? full : it.verdict === 'partial' ? part : 0;
        refresh(); recalc();
      }));
      refresh();
      list.appendChild(div);
    });
    recalc();
  }
  function recalc() {
    const items = state.result.items || [];
    const score = items.reduce((s, i) => s + Number(i.points), 0);
    const max = items.reduce((s, i) => s + Number(i.max_points), 0) || 1;
    const pct = Math.round(score / max * 100);
    state.result.overall = { score, max, pct, grade: FJV.gradeFor(pct) };
    $('scoreVal').textContent = fmt(score); $('scoreMax').textContent = fmt(max);
    $('gradeChip').textContent = state.result.overall.grade;
  }

  // ---------- save (with offline fallback) ----------
  $('saveBtn').addEventListener('click', async () => {
    $('saveSpin').classList.remove('hidden'); $('saveBtn').disabled = true;
    const o = state.result.overall;
    const audit = {
      id: state.auditId, account_code: state.account.account_code, account_name: state.account.account_name,
      captured_by: state.user.id, fixture: state.fixture.label,
      captured_at: new Date().toISOString(), lat: state.lat || null, lng: state.lng || null,
      total_score: o.score, max_score: o.max, grade: o.grade, status: 'synced'
    };
    const items = state.result.items;
    try {
      if (!navigator.onLine) throw new Error('offline');
      const path = await FJV.uploadPhoto(state.blob, state.user.id, state.auditId);
      audit.photo_path = path;
      await FJV.saveAudit(audit, items);
      await openHistory(state.account);
    } catch (e) {
      // queue for later
      audit.status = 'queued';
      await FJVDB.put({ id: state.auditId, audit, items, blob: state.blob, userId: state.user.id });
      refreshSyncBadge();
      alert('Saved offline. It will upload automatically when you are back online.');
      await openHistory(state.account);
    } finally { $('saveSpin').classList.add('hidden'); $('saveBtn').disabled = false; }
  });

  async function syncQueue() {
    if (!navigator.onLine) return;
    const items = await FJVDB.all();
    for (const rec of items) {
      try {
        const path = await FJV.uploadPhoto(rec.blob, rec.userId, rec.id);
        rec.audit.photo_path = path; rec.audit.status = 'synced';
        await FJV.saveAudit(rec.audit, rec.items);
        await FJVDB.remove(rec.id);
      } catch (e) { /* keep in queue, try again next time */ }
    }
    refreshSyncBadge();
  }
  $('syncBtn').addEventListener('click', syncQueue);
  async function refreshSyncBadge() {
    const n = await FJVDB.count();
    const b = $('syncBtn');
    if (n > 0) { b.textContent = 'Sync (' + n + ')'; b.classList.remove('hidden'); }
    else b.classList.add('hidden');
  }

  // ---------- history ----------
  async function openHistory(account) {
    $('historyTitle').textContent = account.account_name;
    const list = $('historyList'); list.innerHTML = '<div class="spin">Loading…</div>';
    show('screen-history');
    try {
      const rows = await FJV.storeHistory(account.account_code);
      if (!rows.length) { list.innerHTML = '<div class="spin">No audits yet for this store.</div>'; return; }
      list.innerHTML = '';
      rows.forEach(r => {
        const div = document.createElement('div'); div.className = 'hrow';
        const d = new Date(r.captured_at).toLocaleDateString();
        div.innerHTML = `<div class="sc">${r.total_score != null ? Math.round(r.total_score) : '—'}</div>
          <div class="m"><b>${esc(r.fixture || '')}</b><small>${d} · ${esc(r.grade || '')}${r.status === 'queued' ? ' · queued' : ''}</small></div>`;
        list.appendChild(div);
      });
    } catch (e) { list.innerHTML = '<div class="spin">Could not load history.</div>'; }
  }
  $('backFromHistory').addEventListener('click', () => { show('screen-account'); });

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
  function fmt(n) { n = Number(n); return Number.isInteger(n) ? String(n) : n.toFixed(1); }
  function blobToBase64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  }

  // ---------- service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
  }

  boot();
})();
