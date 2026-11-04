// ShieldStream - pay-per-video unlocks with shielded Zcash (testnet).
// Uses zkool2's zkool_graphql (MIT) as the wallet backend and `qrcode` (MIT) for QR codes. Everything else is original.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const QRCode = require('qrcode');

const PORT = +process.env.PORT || 3000;
// Merchant wallet: WATCH-ONLY (viewing key) on its own zkool instance, so the public-facing process can see payments but cannot spend or reveal a seed.
const ZK = process.env.ZK_URL || 'http://127.0.0.1:8002/graphql';
const MERCHANT_ACCT = +process.env.MERCHANT_ACCT || 1;
// Demo payer: separate instance holding a small testnet balance. Only used by the capped demo button, never exposed.
const PAYER_URL = process.env.PAYER_URL || 'http://127.0.0.1:8000/graphql';
const PAYER_ACCT = +process.env.PAYER_ACCT || 1;
const MAX_AMOUNT = 1;            // TAZ per request
const DEMO_MAX_AMOUNT = 0.02;                                 // largest invoice the demo button will pay
const DEMO_TOTAL_CAP = +process.env.DEMO_TOTAL_CAP || 0.2;    // total TAZ the demo button may ever send per process lifetime
const DEMO_HOURLY = 10;                                        // demo payments per hour, all users
const CREATE_PER_HOUR_PER_IP = 30;
const DEMO_PAYER = process.env.DEMO_PAYER === '1';
const STORE = path.join(__dirname, '.data', 'purchases.json');
// Merchant access: one admin token (env ADMIN_TOKEN, else generated once into .data/admin_token, never committed). Clients only get an unguessable invoice link.
const TOKEN_FILE = path.join(__dirname, '.data', 'admin_token');
let ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) { try { ADMIN_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { ADMIN_TOKEN = crypto.randomBytes(18).toString('base64url'); fs.writeFileSync(TOKEN_FILE, ADMIN_TOKEN, { mode: 0o600 }); } }
const SESSION = crypto.createHmac('sha256', ADMIN_TOKEN).update('shieldstream-session').digest('hex');
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const isAdmin = (req) => { const m = /(?:^|;\s*)sl_admin=([0-9a-f]+)/.exec(req.headers.cookie || ''); return !!m && eq(m[1], SESSION); };
const EXPLORER = 'https://zexplorer.app/testnet/tx/';

async function gql(query, url = ZK) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join('; '));
  return j.data;
}
let demoBusy = false;
let invoices = {}; // purchases, keyed by unguessable token
try { invoices = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
const save = () => { const t = STORE + '.tmp'; fs.writeFileSync(t, JSON.stringify(invoices, null, 1)); fs.renameSync(t, STORE); };
const hits = new Map(); let demoSpent = 0; const demoTimes = [];
function limited(ip, n) { const now = Date.now(); const a = (hits.get(ip) || []).filter(t => now - t < 3600e3); a.push(now); hits.set(ip, a); return a.length > n; }
let merchantAddr = null, tip = 0, lastSync = 0, syncing = null;

async function addr() {
  if (!merchantAddr) merchantAddr = (await gql(`{ addressByAccount(idAccount: ${MERCHANT_ACCT}) { ua } }`)).addressByAccount.ua;
  return merchantAddr;
}
async function sync(force) {
  if (syncing) return syncing;
  if (!force && Date.now() - lastSync < 4000) return;
  syncing = gql(`mutation { synchronize(idAccounts: [${MERCHANT_ACCT}], fast: false) }`)
    .then(d => { tip = d.synchronize; lastSync = Date.now(); }).finally(() => { syncing = null; });
  return syncing;
}
const b64u = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const zec = n => (+n).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');


// ---- catalog (seed: Big Buck Bunny, (c) Blender Foundation, CC-BY 3.0, cut into 3 clips) ----
const CAT = path.join(__dirname, '.data', 'catalog.json');
const SEED = [
  { id: 'bbb1', title: 'Big Buck Bunny - Part 1: Morning', creator: 'Blender Foundation (CC-BY 3.0)', price: 0.003, duration: 90, file: 'bbb1.mp4', thumb: 'bbb1.jpg' },
  { id: 'bbb2', title: 'Big Buck Bunny - Part 2: The bullies', creator: 'Blender Foundation (CC-BY 3.0)', price: 0.005, duration: 90, file: 'bbb2.mp4', thumb: 'bbb2.jpg' },
  { id: 'bbb3', title: 'Big Buck Bunny - Part 3: Payback', creator: 'Blender Foundation (CC-BY 3.0)', price: 0.008, duration: 90, file: 'bbb3.mp4', thumb: 'bbb3.jpg' }];
let catalog; try { catalog = JSON.parse(fs.readFileSync(CAT, 'utf8')); } catch { catalog = SEED; fs.writeFileSync(CAT, JSON.stringify(catalog, null, 1)); }
const saveCat = () => fs.writeFileSync(CAT, JSON.stringify(catalog, null, 1));
const vid = (id) => catalog.find(v => v.id === id);
const pubVideo = (v) => ({ id: v.id, title: v.title, creator: v.creator, price: v.price, duration: v.duration || 90, thumb: '/thumb/' + v.id });

const OPEN = (p) => p.state === 'waiting' || p.state === 'underpaid';
async function refreshAll() {
  const open = Object.values(invoices).filter(OPEN);
  if (!open.length) return;
  await sync();
  const txs = (await gql(`{ transactionsByAccount(idAccount: ${MERCHANT_ACCT}) { txid height notes { value memo scope } } }`)).transactionsByAccount;
  let changed = false;
  for (const p of open) {
    let paid = 0, last = null;
    for (const t of txs) for (const n of t.notes || []) if (n.scope === 0 && (n.memo || '').trim() === p.code && t.height) { paid += parseFloat(n.value); if (!last || t.height > last.height) last = t; }
    paid = +paid.toFixed(8);
    if (!last || !(paid > 0)) continue;
    const state = paid + 1e-9 < p.price ? 'underpaid' : 'paid';
    if (p.paid !== paid || p.state !== state) { Object.assign(p, { paid, state, txid: last.txid, height: last.height, paidAt: p.paidAt || Date.now() }); changed = true; }
  }
  if (changed) save();
}
async function pview(p) {
  const v = vid(p.video);
  const uri = `zcash:${await addr()}?amount=${zec(p.price)}&memo=${b64u(p.code)}&label=${encodeURIComponent(v.title)}`;
  const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0f1a', light: '#ffffff' } });
  const o = { sent: !!p.demoTx, video: pubVideo(v), code: p.code, price: p.price, paid: p.paid || 0, status: p.state, address: await addr(), uri, qr, network: 'testnet' };
  if (p.state === 'paid') Object.assign(o, { txid: p.txid, height: p.height, explorer: EXPLORER + p.txid, src: `/media/${v.id}?t=${p.token}` });
  return o;
}
const stats = () => catalog.map(v => { const ps = Object.values(invoices).filter(p => p.video === v.id); const paid = ps.filter(p => p.state === 'paid'); return { ...pubVideo(v), unlocks: paid.length, pending: ps.filter(OPEN).length, earned: +paid.reduce((a, p) => a + p.paid, 0).toFixed(8) }; });

function body(req) { return new Promise((ok, no) => { let b = ''; req.on('data', d => { b += d; if (b.length > 2e4) { no(new Error('Too large')); req.destroy(); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { no(new Error('Bad JSON')); } }); }); }
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(obj)); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'";

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim();
    const admin = isAdmin(req); let m;
    if (req.method === 'GET' && p === '/api/me') return send(res, 200, { admin });
    if (req.method === 'POST' && p === '/api/login') {
      if (limited('login:' + ip, 10)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
      const b = await body(req);
      if (!eq(String(b.token || ''), ADMIN_TOKEN)) return send(res, 401, { error: 'Wrong access key.' });
      res.setHeader('set-cookie', `sl_admin=${SESSION}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/logout') { res.setHeader('set-cookie', 'sl_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(res, 200, { ok: true }); }
    if (req.method === 'GET' && p === '/api/videos') return send(res, 200, { videos: catalog.map(pubVideo) });
    if (req.method === 'GET' && (m = p.match(/^\/api\/videos\/(\w+)$/))) { const v = vid(m[1]); return v ? send(res, 200, pubVideo(v)) : send(res, 404, { error: 'Not found' }); }
    if (req.method === 'GET' && (m = p.match(/^\/thumb\/(\w+)$/))) {
      const v = vid(m[1]); if (!v) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' }); return res.end(fs.readFileSync(path.join(__dirname, 'videos', v.thumb)));
    }
    // Start an unlock: creates a purchase with a secret token the viewer keeps in their browser. No account, no email.
    if (req.method === 'POST' && (m = p.match(/^\/api\/videos\/(\w+)\/unlock$/))) {
      const v = vid(m[1]); if (!v) return send(res, 404, { error: 'Not found' });
      if (limited('unlock:' + ip, 30)) return send(res, 429, { error: 'Too many requests. Try again later.' });
      if (Object.keys(invoices).length > 3000) return send(res, 503, { error: 'Storage limit reached.' });
      const token = crypto.randomBytes(16).toString('hex'); const code = 'SS-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      invoices[token] = { token, video: v.id, code, price: v.price, state: 'waiting', created: Date.now() }; save();
      return send(res, 200, { token });
    }
    if (req.method === 'GET' && (m = p.match(/^\/api\/purchases\/([0-9a-f]{32})$/))) {
      const pu = invoices[m[1]]; if (!pu) return send(res, 404, { error: 'Not found' });
      await refreshAll(); return send(res, 200, await pview(pu));
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/purchases\/([0-9a-f]{32})\/demo-pay$/))) {
      if (!DEMO_PAYER) return send(res, 403, { error: 'Demo payer disabled.' });
      const pu = invoices[m[1]]; if (!pu) return send(res, 404, { error: 'Not found' });
      if (pu.state !== 'waiting') return send(res, 409, { error: 'Already paid or in progress.' });
      if (pu.demoTx) return send(res, 200, { txid: pu.demoTx });
      if (pu.demoPending) return send(res, 409, { error: 'Already sending.' });
      const now = Date.now(); while (demoTimes.length && now - demoTimes[0] > 3600e3) demoTimes.shift();
      if (demoTimes.length >= DEMO_HOURLY || demoSpent + pu.price > DEMO_TOTAL_CAP) return send(res, 429, { error: 'Demo wallet limit reached. Pay from your own testnet wallet.' });
      if (demoBusy) return send(res, 503, { error: 'Another demo payment is being sent. Try again in a few seconds.' });
      demoBusy = true; pu.demoPending = true; demoSpent += pu.price; demoTimes.push(now);
      try {
        await gql(`mutation { synchronize(idAccounts: [${PAYER_ACCT}], fast: false) }`, PAYER_URL);
        const a = await addr();
        const d = await gql(`mutation { pay(idAccount: ${PAYER_ACCT}, payment: { recipients: [{ address: "${a}", amount: ${zec(pu.price)}, memo: "${pu.code}" }], confirmations: 1 }) }`, PAYER_URL);
        pu.demoTx = d.pay;
      } catch (e) { demoSpent -= pu.price; demoTimes.pop(); pu.demoPending = false;
        if (/note selection|insufficient|balance|funds/i.test(String(e.message))) return send(res, 503, { error: 'The demo wallet is still confirming a previous payment. Try again in 1 to 2 minutes, or pay from your own testnet wallet.' });
        throw e; } finally { pu.demoPending = false; demoBusy = false; }
      save(); return send(res, 200, { txid: pu.demoTx });
    }
    // Media: bytes are served only with a purchase token that is PAID for exactly this video. Range requests supported (needed by video players).
    if ((req.method === 'GET' || req.method === 'HEAD') && (m = p.match(/^\/media\/(\w+)$/))) {
      const v = vid(m[1]); const t = u.searchParams.get('t') || '';
      const pu = /^[0-9a-f]{32}$/.test(t) ? invoices[t] : null;
      if (!v || !pu || pu.video !== v.id || pu.state !== 'paid') { res.writeHead(402, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); return res.end('Payment required'); }
      const f = path.join(__dirname, 'videos', v.file); const size = fs.statSync(f).size; const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      let a = 0, b = size - 1, code = 200;
      if (r) { if (r[1] !== '') a = +r[1]; if (r[2] !== '') b = Math.min(+r[2], size - 1); if (r[1] === '' && r[2] !== '') { a = Math.max(0, size - +r[2]); b = size - 1; } if (a > b || a >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); } code = 206; }
      const h = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': b - a + 1, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }; if (code === 206) h['content-range'] = `bytes ${a}-${b}/${size}`;
      res.writeHead(code, h); if (req.method === 'HEAD') return res.end(); return fs.createReadStream(f, { start: a, end: b }).pipe(res);
    }
    // Creator dashboard API
    if (p === '/api/creator/stats' && req.method === 'GET') { if (!admin) return send(res, 401, { error: 'Creator sign-in required.' }); await refreshAll();
      const v = stats(); return send(res, 200, { videos: v, total: +v.reduce((a, x) => a + x.earned, 0).toFixed(8), unlocks: v.reduce((a, x) => a + x.unlocks, 0) }); }
    if (req.method === 'POST' && (m = p.match(/^\/api\/creator\/videos\/(\w+)\/price$/))) {
      if (!admin) return send(res, 401, { error: 'Creator sign-in required.' }); const v = vid(m[1]); if (!v) return send(res, 404, { error: 'Not found' });
      const x = parseFloat((await body(req)).price); if (!(x >= 0.0001 && x <= MAX_AMOUNT)) return send(res, 400, { error: 'Price must be 0.0001 to 1 TAZ.' }); v.price = +x.toFixed(8); saveCat(); return send(res, 200, pubVideo(v));
    }
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, tip, network: 'testnet' });
    const SPA = p === '/' || /^\/(watch|unlock)\/\w+$/.test(p) || ['/login', '/studio', '/privacy'].includes(p);
    let f = SPA ? '/index.html' : p;
    f = path.join(__dirname, 'public', path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'content-security-policy': CSP }); res.end(fs.readFileSync(f));
  } catch (e) { console.error(e); send(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, '127.0.0.1', () => console.log('ShieldStream on http://127.0.0.1:' + PORT));
