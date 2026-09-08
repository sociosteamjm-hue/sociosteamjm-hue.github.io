// Dependency-free handler tests. Run with Node, without credentials or network:
// node uat-v3/supabase/functions/send-email/handler.mock-test.mjs
import { readFileSync } from 'node:fs';

export async function testHandler(source) {
  // Remove only this handler's simple TS annotations; this is not a type-check.
  const js = source.replace(/^import .*;\r?\n/gm, '')
    .replace(/: (number|unknown|Request|string)\b/g, '')
    .replace(/\]!/g, ']').replace(/\)!/g, ')');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  let passed = 0;
  for (const scenario of ['success', 'viewer', 'unauthenticated', 'unconfigured', 'duplicate', 'uncertain', 'wrong-recipient', 'auth-failure', 'smtp-failure', 'missing-migration', 'record-failure', 'concurrent']) {
    let handler, sends = 0, row = null;
    const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'server', EMAIL_FROM: 'sender@gmail.com', GMAIL_APP_PASSWORD: scenario === 'unconfigured' ? '' : 'fake-test-only' };
    const client = {
      auth: { getUser: async () => ({ data: { user: scenario === 'unauthenticated' ? null : { id: 'user' } } }) },
      from(table) {
        let action = 'select', payload, filters = [];
        const query = {
          select() { return query; }, eq() { return query; },
          is(k, v) { filters.push([k, v]); return query; },
          insert(p) { action = 'insert'; payload = p; return query; },
          update(p) { action = 'update'; payload = p; return query; },
          single() { return query; }, maybeSingle() { return query; },
          then(resolve, reject) { return Promise.resolve().then(() => {
            if (table === 'app_users') return { data: { role: scenario === 'viewer' ? 'viewer' : 'staff' } };
            if (table === 'public_requests') return { data: { id: 'request', status: 'approved', email: 'recipient@example.com', name: '<Test>', request_number: 1 } };
            if (action === 'insert') {
              if (row) return { error: { code: '23505' } };
              row = { ...payload, sent_at: scenario === 'duplicate' ? 'now' : null, attempted_at: scenario === 'uncertain' ? 'now' : null };
              if (scenario === 'wrong-recipient') row.payload.to = ['different@example.com'];
              return {};
            }
            if (action === 'update') {
              if (scenario === 'missing-migration' || (scenario === 'record-failure' && payload.sent_at)) return { error: {} };
              if (filters.some(([k, v]) => row[k] !== v)) return { data: null };
              Object.assign(row, payload); return { data: { id: row.id } };
            }
            return { data: row };
          }).then(resolve, reject); },
        }; return query;
      },
    };
    const mailer = { createTransport(options) {
      assert(options.port === 465 && options.secure === true, 'TLS required');
      return {
        async verify() { if (scenario === 'auth-failure') throw Error('test auth'); },
        async sendMail(payload) {
          sends++; assert(payload.html.includes('&lt;Test&gt;'), 'HTML escaped');
          if (scenario === 'smtp-failure') throw Error('test uncertainty');
          return { accepted: ['recipient@example.com'], messageId: 'test-message' };
        }, close() {},
      };
    } };
    class MockResponse { constructor(body, options) { this.status = options?.status || 200; this.body = body; } }
    new Function('Deno', 'createClient', 'nodemailer', 'Response', js)(
      { env: { get: k => env[k] }, serve: fn => { handler = fn; } }, () => client, mailer, MockResponse);
    const request = { method: 'POST', headers: { get: () => 'Bearer test' }, json: async () => ({ kind: 'decision', request_id: 'request' }) };
    const results = scenario === 'concurrent' ? await Promise.all([handler(request), handler(request)]) : [await handler(request)];
    const expected = { success: 200, viewer: 403, unauthenticated: 401, unconfigured: 503, duplicate: 200, uncertain: 409, 'wrong-recipient': 409, 'auth-failure': 502, 'smtp-failure': 502, 'missing-migration': 500, 'record-failure': 502 };
    if (scenario !== 'concurrent') assert(results[0].status === expected[scenario], scenario + ': unexpected status ' + results[0].status);
    assert(sends === (['success', 'smtp-failure', 'record-failure', 'concurrent'].includes(scenario) ? 1 : 0), scenario + ': unexpected send count');
    if (scenario === 'auth-failure') assert(row.attempted_at === null, 'Pre-submission failure retryable');
    if (scenario === 'smtp-failure') { await handler(request); assert(sends === 1, 'Uncertain send must not retry'); }
    passed++;
  }
  return passed + ' handler scenarios passed (mocked database and SMTP; no live send).';
}

console.log(await testHandler(readFileSync(new URL('./index.ts', import.meta.url), 'utf8')));
