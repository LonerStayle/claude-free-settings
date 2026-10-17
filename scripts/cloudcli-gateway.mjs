import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);
export function creditExhausted(status, body) {
  if (![400, 402, 403].includes(status)) return false;
  try {
    const message = JSON.parse(body)?.error?.message;
    return typeof message === 'string' && /credit balance (?:is )?too low|insufficient (?:credit|balance)|(?:credit|balance).*(?:exhausted|depleted)/i.test(message);
  } catch { return false; }
}

// Retry only a rejected HTTP request. Never replay an SDK turn or an already-started stream.
export async function startGateway({ keys, initialAccount = '1', onSwitch = async () => {}, upstream = 'https://api.anthropic.com' }) {
  const accounts = ['1', '2'].filter(a => keys[a]);
  if (!accounts.length) throw new Error('사용 가능한 Anthropic API 키가 없습니다.');
  let active = accounts.includes(initialAccount) ? initialAccount : accounts[0];
  const token = randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
    const presented = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer /i, '');
    const a = Buffer.from(String(presented)), b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) { res.writeHead(401); res.end('Unauthorized'); return; }
    if (!req.url.startsWith('/v1/')) { res.writeHead(404); res.end(); return; }
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) { res.writeHead(413); res.end(); return; }
        chunks.push(chunk);
      }
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const first = active;
      const order = [first, ...accounts.filter(x => x !== first)];
      for (let index = 0; index < order.length; index++) {
        const account = order[index];
        const headers = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (!hopHeaders.has(key) && !['authorization', 'x-api-key', 'cookie'].includes(key) && value !== undefined) headers[key] = value;
        }
        headers['x-api-key'] = keys[account];
        const response = await fetch(upstream + req.url, { method: req.method, headers, body, signal: abort.signal, redirect: 'error' });
        let errorBody;
        if (!response.ok) {
          errorBody = await response.text();
          if (creditExhausted(response.status, errorBody) && index < order.length - 1) {
            // Remember the working candidate for subsequent requests, even concurrent ones.
            active = order[index + 1];
            await onSwitch(active);
            console.error(`[CloudCLI] 계정 ${account} 크레딧 부족 → 계정 ${active}로 전환`);
            continue;
          }
        }
        const outHeaders = {};
        for (const [key, value] of response.headers) {
          // fetch transparently decompresses responses.
          if (!hopHeaders.has(key) && key !== 'content-encoding' && key !== 'set-cookie') outHeaders[key] = value;
        }
        res.writeHead(response.status, outHeaders);
        if (errorBody !== undefined) res.end(errorBody);
        else if (response.body) await pipeline(Readable.fromWeb(response.body), res);
        else res.end();
        return;
      }
    } catch {
      if (!res.headersSent) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { type: 'api_error', message: 'Anthropic 연결 실패. 요청을 자동 재실행하지 않았습니다.' } })); }
      else res.destroy();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, token, activeAccount: () => active,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
