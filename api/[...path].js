// Vercel deployment proxy: forwards API, thumbnail and media requests to the
// existing ShieldStream backend (fixed ngrok endpoint) with the header ngrok
// needs to skip its browser interstitial. No state lives here.
const UPSTREAM = 'https://freezable-underfoot-lustfully.ngrok-free.dev';
const HOP = new Set(['connection', 'transfer-encoding', 'content-encoding', 'keep-alive', 'upgrade']);

module.exports = async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;
    // /api/proxy/<rest> proxies to /<rest>; any other path passes through unchanged.
    const upstreamPath = p.startsWith('/api/proxy/') ? p.slice('/api/proxy'.length) : p;
    console.log('[proxy]', req.method, p, '->', upstreamPath + u.search);
    const headers = { 'ngrok-skip-browser-warning': '1' };
    for (const h of ['accept', 'content-type', 'range', 'cookie', 'authorization', 'x-forwarded-for', 'if-none-match', 'if-modified-since']) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = typeof req.body === 'string' ? req.body : (req.body ? JSON.stringify(req.body) : undefined);
      if (body && !headers['content-type']) headers['content-type'] = 'application/json';
    }
    const up = await fetch(UPSTREAM + upstreamPath + u.search, { method: req.method, headers, body });
    res.status(up.status);
    up.headers.forEach((v, k) => { if (!HOP.has(k) && k !== 'set-cookie') res.setHeader(k, v); });
    const cookies = up.headers.getSetCookie ? up.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader('set-cookie', cookies);
    res.send(Buffer.from(await up.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: 'Upstream unavailable' });
  }
};
module.exports.config = { maxDuration: 30 };
