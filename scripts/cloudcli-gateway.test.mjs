import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startGateway } from './cloudcli-gateway.mjs';
const exhausted = JSON.stringify({ error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
async function fixture(t, handler) {
  const upstream = http.createServer(handler);
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const switches = [];
  const gateway = await startGateway({ keys: { '1': 'key-one', '2': 'key-two' }, upstream: `http://127.0.0.1:${upstream.address().port}`, onSwitch: async a => switches.push(a) });
  t.after(async () => { await gateway.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  return { gateway, switches, send: (body = '{"model":"claude-opus-5-5","stream":true}', extra = {}) => fetch(gateway.url + '/v1/messages?beta=true', { method: 'POST', headers: { 'x-api-key': gateway.token, 'content-type': 'application/json', 'anthropic-beta': 'test-sdk-beta', 'user-agent': 'claude-agent-sdk-test', ...extra }, body }) };
}
test('credit exhaustion switches keys, preserves SDK request and streams, remains on key 2', async t => {
  const seen = [];
  const { send, switches } = await fixture(t, async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    seen.push({ key: req.headers['x-api-key'], beta: req.headers['anthropic-beta'], url: req.url, body });
    if (req.headers['x-api-key'] === 'key-one') { res.writeHead(400); res.end(exhausted); }
    else { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: message_start\ndata: {}\n\n'); res.end('event: message_stop\ndata: {}\n\n'); }
  });
  const expected = 'event: message_start\ndata: {}\n\nevent: message_stop\ndata: {}\n\n';
  assert.equal(await (await send()).text(), expected);
  assert.equal(await (await send()).text(), expected);
  assert.deepEqual(seen.map(x => x.key), ['key-one', 'key-two', 'key-two']);
  assert.deepEqual(switches, ['2']);
  assert.equal(seen[0].body, seen[1].body);
  assert.equal(seen[1].beta, 'test-sdk-beta');
  assert.equal(seen[1].url, '/v1/messages?beta=true');
});
for (const status of [400, 401, 429, 500]) test(`unrelated ${status} never switches accounts`, async t => {
  let count = 0;
  const { send, switches } = await fixture(t, (req, res) => { count++; res.writeHead(status); res.end(JSON.stringify({error:{message:'Some other error'}})); });
  assert.equal((await send()).status, status);
  assert.equal(count, 1); assert.deepEqual(switches, []);
});
test('both exhausted stops after two attempts', async t => {
  let count = 0;
  const { send } = await fixture(t, (req, res) => { count++; res.writeHead(400); res.end(exhausted); });
  const result = await send(); assert.equal(result.status, 400); assert.equal(await result.text(), exhausted); assert.equal(count, 2);
});
test('never retries an already-started SSE response', async t => {
  let count = 0;
  const { send, switches } = await fixture(t, (req, res) => { count++; res.writeHead(200, {'content-type':'text/event-stream'}); res.end(`event: error\ndata: ${exhausted}\n\n`); });
  assert.equal((await send()).status, 200); assert.equal(count, 1); assert.deepEqual(switches, []);
});
test('gateway refuses requests without its private local token', async t => {
  let count = 0;
  const { gateway } = await fixture(t, (req, res) => { count++; res.end(); });
  assert.equal((await fetch(gateway.url + '/v1/models')).status, 401); assert.equal(count, 0);
});
