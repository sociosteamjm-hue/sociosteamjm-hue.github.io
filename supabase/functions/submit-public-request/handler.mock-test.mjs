import { readFileSync } from 'node:fs';

export async function testSubmission(source) {
  const js = source.replace(/^import .*;\r?\n/gm, '').replace(/: (number|unknown|Request)\b/g, '').replace(/\)!/g, ')');
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  for (const scenario of ['membership', 'donation', 'invalid', 'mail-failed', 'mail-timeout']) {
    let handler, saves = 0, sends = 0;
    const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'server' };
    class MockResponse { constructor(body, options) { this.status = options.status; this.data = JSON.parse(body); } }
    const client = { rpc: async () => {
      saves++;
      return scenario === 'invalid' ? { error: { message: 'Invalid input' } } : { data: { id: 'saved-id', request_number: 42, status: 'pending' } };
    } };
    const mockFetch = async (url, options) => {
      sends++;
      assert(options.headers.Authorization === 'Bearer server', 'Only server authenticates acknowledgement');
      assert(JSON.parse(options.body).request_id === 'saved-id', 'Use saved request ID');
      if (scenario === 'mail-timeout') throw Error('timeout');
      return { ok: scenario !== 'mail-failed', json: async () => ({ ok: scenario !== 'mail-failed' }) };
    };
    new Function('Deno', 'createClient', 'Response', 'fetch', 'AbortSignal', js)(
      { serve: fn => { handler = fn; }, env: { get: key => env[key] } },
      () => client, MockResponse, mockFetch, { timeout: () => null });
    const result = await handler({ method: 'POST', text: async () => JSON.stringify({ payload: { request_type: scenario === 'donation' ? 'donation' : 'membership' } }) });
    assert(saves === 1, 'Exactly one submission');
    assert(result.status === (scenario === 'invalid' ? 400 : 200), scenario + ': status');
    assert(sends === (['invalid', 'donation'].includes(scenario) ? 0 : 1), scenario + ': sends');
    if (scenario.startsWith('mail-')) assert(result.data.email_status === 'failed' && result.data.request_number === 42, 'Mail failure preserves saved request');
  }
  return '5 submission scenarios passed (no live requests or emails).';
}

console.log(await testSubmission(readFileSync(new URL('./index.ts', import.meta.url), 'utf8')));
