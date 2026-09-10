import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST required' });
  let payload;
  try {
    const body = await req.text();
    if (body.length > 16000) return reply(413, { error: 'Pedido demasiado grande.' });
    payload = JSON.parse(body).payload;
  } catch { return reply(400, { error: 'Pedido inválido.' }); }

  const url = Deno.env.get('SUPABASE_URL')!;
  // Keep the same anonymous RPC validation, honeypot and per-email rate limit.
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await client.rpc('submit_public_request', { payload });
  if (error) return reply(400, { error: error.message });
  if (!data?.id || !data.request_number) return reply(502, { error: 'Não foi possível confirmar a referência do pedido.' });

  let emailStatus = 'not_applicable';
  if (payload.request_type === 'membership') {
    // Only the newly saved request ID is forwarded. The mail handler loads the
    // recipient and all payment details from the database, not from this call.
    emailStatus = 'failed';
    try {
      const response = await fetch(url + '/functions/v1/send-email', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'acknowledgement', request_id: data.id }),
        signal: AbortSignal.timeout(45000),
      });
      const result = await response.json();
      if (response.ok && result.ok) emailStatus = 'sent';
    } catch { /* The saved request must remain successful even if email fails. */ }
  }
  return reply(200, { ...data, email_status: emailStatus });
});
