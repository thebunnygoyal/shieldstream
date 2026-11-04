const app = document.getElementById('app'), nav = document.getElementById('nav');
const mmss = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const fmt = (n) => (+n).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let timer, admin = false;
const go = (u) => { history.pushState({}, '', u); route(); };
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-go]'); if (a) { e.preventDefault(); go(a.getAttribute('href')); } });
async function api(url, opt) { const r = await fetch(url, opt); let j = {}; try { j = await r.json(); } catch {} return { ok: r.ok, status: r.status, j }; }
const post = (url, body) => api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
const store = { get: (k) => { try { return localStorage.getItem('ss_' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('ss_' + k, v); } catch {} } };
function renderNav() { nav.innerHTML = `<a data-go href="/">Videos</a>` + (admin ? `<a data-go href="/studio">Creator studio</a><a href="#" id="out">Sign out</a>` : `<a data-go href="/login">Creator sign in</a>`);
  const o = document.getElementById('out'); if (o) o.onclick = async (e) => { e.preventDefault(); await post('/api/logout'); admin = false; go('/'); }; }
const CHECK = '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="#34d399"/><path d="M7.5 12.4l3 3 6-6.2" fill="none" stroke="#052e1f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
async function home() {
  const { j } = await api('/api/videos');
  const st = {}; await Promise.all(j.videos.map(async v => { const k = store.get('t_' + v.id); if (k) { const r = await api('/api/purchases/' + k); if (r.ok) st[v.id] = r.j.status; } }));
  const mine = j.videos.filter(v => st[v.id] === 'paid').length;
  app.innerHTML = `<h1>Pay for the video.<br>Not with your <em>identity</em>.</h1>
  <p class="sub">Pay creators per video with shielded Zcash. No account, no email, no ad profile. Your payment isn't linked to you on the public blockchain.</p>
  ${mine ? `<div class="lib">${mine} unlocked on this device</div>` : ''}<div class="vlist">${j.videos.map(v => { const s = st[v.id]; const pos = +store.get('pos_' + v.id) || 0; const badge = s === 'paid' ? `<span class="badge ok">Unlocked${pos > 5 ? ' · resume ' + mmss(pos) : ''}</span>` : s ? `<span class="badge wait">Payment pending</span>` : `<span class="price">${fmt(v.price)} TAZ</span>`; return `<a data-go href="/watch/${v.id}" class="vcard"><div class="th"><img src="${v.thumb}" alt=""><span class="dur">${mmss(v.duration)}</span></div><div class="vm"><b>${esc(v.title)}</b><small>${esc(v.creator)}</small>${badge}</div></a>`; }).join('')}</div>
  <p class="note"><a data-go href="/privacy">Privacy and limits</a></p><p class="note"><b>Honest limits.</b> This server and the creator can see which video you unlock and your IP address. Zcash hides the payment on the public chain, not your network activity. Videos have no DRM. Testnet only, with worthless TAZ.</p>`;
}
async function watch(id) {
  const v = (await api('/api/videos/' + id)).j; if (!v.id) { app.innerHTML = '<div class="card">Video not found.</div>'; return; }
  let tok = store.get('t_' + id);
  if (tok) { const r = await api('/api/purchases/' + tok); if (!r.ok) { tok = null; } }
  if (!tok) { app.innerHTML = `<a data-go href="/" class="back">‹ Videos</a><div class="card"><div class="locked"><img src="${v.thumb}" alt=""><div class="lock"><svg viewBox="0 0 24 24" width="38" height="38"><rect x="5" y="11" width="14" height="9" rx="2" fill="#f4b728"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="#f4b728" stroke-width="2"/></svg></div></div>
    <h1 style="margin:10px 0 2px;font-size:20px">${esc(v.title)}</h1><div class="lbl" style="margin-top:0">${esc(v.creator)}</div><div class="amt">${fmt(v.price)} <small>TAZ</small></div>
    <button id="ub">Unlock with shielded payment</button><p class="note">No account needed. You'll get a payment code. The video unlocks after the payment is mined, about a minute on testnet.</p></div>`;
    document.getElementById('ub').onclick = async (e) => { e.target.disabled = true; const r = await post(`/api/videos/${id}/unlock`); if (!r.ok) { alert(r.j.error); e.target.disabled = false; return; } store.set('t_' + id, r.j.token); go('/watch/' + id); }; return; }
  poll(id, tok); timer = setInterval(() => poll(id, tok), 4000);
}
let shownState;
async function poll(id, tok) {
  const r = await api('/api/purchases/' + tok); if (!r.ok) return; const s = r.j; const key = s.status + s.paid + s.sent; if (s.sent && !window.__sentSeen) { window.__sentSeen = true; t0 = Date.now(); }
  if (shownState === key) return; shownState = key;
  if (s.status === 'paid') {
    clearInterval(timer);
    app.innerHTML = `<a data-go href="/" class="back">‹ Videos</a><div class="card"><video controls playsinline preload="metadata" src="${s.src}" poster="${s.video.thumb}"></video>
    <h1 style="margin:10px 0 2px;font-size:20px">${esc(s.video.title)}</h1><div class="lbl" style="margin-top:0">${esc(s.video.creator)}</div>
    <div class="unl">${CHECK}<span>Unlocked by a mined shielded payment (block ${s.height}).</span></div>
    <div id="rs" class="note" style="margin:0 0 8px"></div><div class="kv"><span>Paid</span><span>${fmt(s.paid)} TAZ</span></div><div class="kv"><span>Transaction</span><span>${s.txid.slice(0, 8)}...${s.txid.slice(-6)}</span></div>
    <a href="${s.explorer}" target="_blank" rel="noopener"><button class="ghost">View transaction</button></a>
    <p class="note">This device holds the unlock key. Clear your browser data and you lose access. Anyone with this page's key link could watch, and the file has no DRM.</p></div>`;
    const vd = document.querySelector('video'); const pos = +store.get('pos_' + id) || 0;
    vd.addEventListener('loadedmetadata', () => { if (pos > 5 && pos < vd.duration - 5) { vd.currentTime = pos; document.getElementById('rs').textContent = 'Resumed at ' + mmss(pos) + '.'; } });
    vd.addEventListener('timeupdate', () => store.set('pos_' + id, vd.currentTime));
    vd.addEventListener('ended', () => store.set('pos_' + id, 0));
    return;
  }
  const warn = s.status === 'underpaid' ? `<div class="err">Received ${fmt(s.paid)} of ${fmt(s.price)} TAZ. Send the rest with the same memo.</div>` : '';
  if (document.getElementById('pw')) { document.getElementById('st').innerHTML = steps(s); const dpb = document.getElementById('dp'); if (dpb && s.sent) { dpb.textContent = 'Sent. Waiting for it to be mined...'; dpb.disabled = true; } document.getElementById('warn').innerHTML = warn; return; }
  app.innerHTML = `<a data-go href="/" class="back">‹ Videos</a><div class="card" id="pw"><div class="lbl" style="margin:0">Unlock</div><h1 style="margin:2px 0;font-size:20px">${esc(s.video.title)}</h1><div class="amt">${fmt(s.price)} <small>TAZ</small></div>
  <div id="st">${steps(s)}</div><div id="warn">${warn}</div>
  <div id="dm"></div><div class="or">or pay from your own testnet wallet</div><div class="qr">${s.qr}</div>
  <a href="${esc(s.uri)}"><button class="ghost">Open in wallet</button></a><button class="ghost" id="cp">Copy address</button>
  <div style="margin-top:14px"><div class="kv"><span>Memo (required)</span><span>${esc(s.code)}</span></div><div class="kv"><span>Network</span><span>Zcash testnet</span></div></div>
  <label>Address</label><div class="addr">${esc(s.address)}</div>
  <p class="note">The memo links your payment to this unlock. Wallets that ignore the QR memo need it pasted in. Only tested with this app's demo wallet.</p>
  <p class="note"><b>Sent the wrong amount or no unlock after a few minutes?</b> Keep this page. A short payment unlocks once the total reaches the price. A payment without this memo can't be matched, and there are no refunds in this prototype. <a data-go href="/privacy">Privacy and limits</a></p></div>`;
  document.getElementById('cp').onclick = async (e) => { await navigator.clipboard.writeText(s.address); e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy address', 1500); };
  if (s.demo !== false) { const d = document.getElementById('dm'); d.innerHTML = `<button id="dp" ${s.sent ? 'disabled' : ''}>${s.sent ? 'Sent. Waiting for it to be mined...' : 'Pay with demo wallet'}</button><div class="sm" style="text-align:center">Sends a real shielded testnet payment (worthless TAZ) from a demo wallet.</div><div class="err" id="de"></div>`;
    document.getElementById('dp').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Sending shielded payment...'; const r = await post(`/api/purchases/${tok}/demo-pay`); if (!r.ok) { document.getElementById('de').textContent = r.j.error; e.target.disabled = false; e.target.textContent = 'Pay with demo wallet'; } else { e.target.textContent = 'Sent. Waiting for it to be mined...'; shownState = null; poll(id, tok); } }; }
}
let t0 = Date.now(); setInterval(() => { const e = document.getElementById('el'); if (e) e.textContent = mmss((Date.now() - t0) / 1000); }, 1000);
const steps = (s) => { const sent = s.sent || s.status === 'underpaid'; return `<div class="steps"><div class="step done"><div class="dot">✓</div>Unlock requested</div><div class="step ${sent ? 'done' : 'on'}"><div class="dot">${sent ? '✓' : ''}</div>${sent ? 'Payment sent' : 'Awaiting your payment'}</div><div class="step ${sent ? 'on' : ''}"><div class="dot"></div>${sent ? 'Waiting for the payment to be mined' : 'Mined on-chain, then video unlocks'}</div></div>${sent ? '<div class="sm">Waiting <span id="el">0:00</span>. Testnet blocks take about 1 to 2 minutes. This page unlocks by itself.</div>' : '<div class="sm">Pay below. Nothing has been sent yet.</div>'}`; };
function privacy() { app.innerHTML = `<a data-go href="/" class="back">‹ Videos</a><h1 style="font-size:24px">Privacy and limits</h1><div class="card"><div class="kv"><span>Viewer account</span><span>None</span></div><p class="note"><b>What is private.</b> Your payment is a shielded Zcash transaction. The public blockchain does not show who paid, how much, or the memo. There is no email, login or ad profile.</p><p class="note"><b>What is not.</b> This server and the creator can see which video was unlocked, the amount, and your IP address. Zcash does not hide network activity. Use a VPN or Tor if that matters to you.</p><p class="note"><b>Your unlock key</b> is stored in this browser. Clear browser data and you lose access to videos you paid for. Anyone with the key can watch.</p><p class="note"><b>Wrong or missing payment.</b> If you send less than the price, the page shows how much is still due and unlocks once the total reaches the price. If you send the wrong memo, the payment cannot be matched. This prototype has no refunds and no support desk, so only use testnet coins.</p><p class="note"><b>Videos</b> have no copy protection. Testnet only: TAZ has no value.</p></div>`; }
function login() { app.innerHTML = `<h1>Creator sign in</h1><p class="sub">Paste the creator access key set when the server started.</p><form class="card" id="f"><label>Access key</label><input id="t" type="password" required><button>Sign in</button><div class="err" id="e"></div></form>`;
  document.getElementById('f').onsubmit = async (ev) => { ev.preventDefault(); const r = await post('/api/login', { token: t.value }); if (!r.ok) return (e.textContent = r.j.error || 'Failed'); admin = true; renderNav(); go('/studio'); }; }
async function studio() {
  const r = await api('/api/creator/stats'); if (r.status === 401) return go('/login'); const d = r.j;
  app.innerHTML = `<h1 style="margin-top:6px">Creator studio</h1><div class="stats"><div class="card stat"><span>Earned</span><b>${fmt(d.total)}</b><small>TAZ</small></div><div class="card stat"><span>Unlocks</span><b>${d.unlocks}</b></div></div>
  <div class="list">${d.videos.map(v => `<div class="item"><div><b>${esc(v.title)}</b><small>${v.unlocks} unlocked · ${v.pending} awaiting payment · earned ${fmt(v.earned)} TAZ</small></div><div class="r"><input class="pin" data-v="${v.id}" value="${fmt(v.price)}" inputmode="decimal"><small>TAZ price</small></div></div>`).join('')}</div>
  <p class="note">Counts include only payments mined on-chain with the matching memo. You see which video was unlocked. There are no viewer accounts, so no names or emails, but the server can see IP addresses. Prices apply to new unlocks. Adding videos is done by the operator in this prototype.</p>`;
  app.querySelectorAll('.pin').forEach(i => i.onchange = async () => { const r = await post(`/api/creator/videos/${i.dataset.v}/price`, { price: i.value }); i.style.borderColor = r.ok ? '#34d399' : '#f87171'; });
}
async function route() {
  clearInterval(timer); shownState = null; t0 = Date.now(); const p = location.pathname;
  admin = (await api('/api/me')).j.admin || false; renderNav(); let m;
  if (p === '/') return home();
  if (p === '/privacy') return privacy();
  if (p === '/login') return admin ? go('/studio') : login();
  if (p === '/studio') return admin ? studio() : go('/login');
  if ((m = p.match(/^\/watch\/(\w+)/))) return watch(m[1]);
  home();
}
window.onpopstate = route; route();
