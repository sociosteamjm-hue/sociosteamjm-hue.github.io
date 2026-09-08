import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST required' });
  try {
    const authorization = req.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: identity, error: authError } = await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !identity.user) return reply(401, { error: 'Authentication required' });
    const { data: profile } = await userClient.from('app_users').select('role').eq('user_id', identity.user.id).single();
    if (!profile || !['admin', 'staff'].includes(profile.role)) return reply(403, { error: 'Not permitted' });
    const input = await req.json();
    if (!['receipt', 'decision'].includes(input.kind)) return reply(400, { error: 'Invalid kind' });
    // Gmail is a planned configuration, not a valid Resend sender.
    if ((Deno.env.get('EMAIL_PROVIDER') || 'resend') !== 'resend') return reply(503, { error: 'Selected email provider is not implemented yet' });
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('EMAIL_FROM');
    if (!apiKey || !from) return reply(503, { error: 'Email service is not configured' });
    let recipient: string;
    let subject: string;
    let text: string;
    let key: string;
    if (input.kind === 'decision') {
      const { data: request, error } = await userClient.from('public_requests').select('*').eq('id', input.request_id).single();
      if (error || !request || request.status === 'pending') return reply(400, { error: 'Request must be reviewed first' });
      recipient = request.email;
      key = 'decision-' + request.id;
      subject = 'Team JM — resposta ao pedido PED-' + request.request_number;
      text = 'Olá ' + request.name + ',\n\nO seu pedido PED-' + request.request_number + ' foi ' + (request.status === 'approved' ? 'aprovado' : 'rejeitado') + '.\n' + (request.review_notes || '') + '\n\nAssociação Team JM';
    } else {
      const { data: receipt, error } = await userClient.from('receipts').select('*').eq('id', input.receipt_id).single();
      if (error || !receipt) return reply(404, { error: 'Receipt not found' });
      recipient = String(input.recipient || '').trim();
      if (input.request_id) {
        const { data: request } = await userClient.from('public_requests').select('email,receipt_id').eq('id', input.request_id).single();
        if (!request || request.receipt_id !== receipt.id) return reply(400, { error: 'Receipt does not match request' });
        recipient = request.email;
      }
      if (!recipient && receipt.member_id) {
        const { data: member } = await userClient.from('members').select('email').eq('id', receipt.member_id).single();
        recipient = member?.email || '';
      }
      key = 'receipt-' + receipt.id;
      subject = 'Team JM — Recibo n.º ' + receipt.receipt_number;
      const years = receipt.quota_years || (receipt.quota_year ? [receipt.quota_year] : []);
      text = 'ASSOCIAÇÃO TEAM JM\nNIF: 519 312 724\nRua do Centro, 19 · 2440-210 Reguengo do Fetal\nteamjm29@gmail.com\n\nRECIBO N.º ' + receipt.receipt_number + '\nData: ' + receipt.receipt_date + '\nRecebemos de: ' + receipt.payer_name + '\nNIF/NIPC: ' + (receipt.payer_tax_id || '—') + '\nMorada: ' + (receipt.payer_address || '—') + '\nSócio n.º: ' + (receipt.member_number || '—') + '\nTipo: ' + receipt.receipt_type + '\nAnos: ' + (years.join(', ') || '—') + '\nPagamento: ' + receipt.payment_method + '\nValor: ' + Number(receipt.amount).toFixed(2) + ' EUR\n\n' + receipt.description + '\n\nPara os devidos efeitos, declara-se recebido o valor acima indicado.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 320) return reply(400, { error: 'Valid email required' });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const proposed = { from, to: [recipient], subject, text, html: '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;line-height:1.6;white-space:pre-wrap">' + escapeHtml(text) + '</div>' };
    // Persist one immutable payload per document before calling the provider.
    const inserted = await admin.from('email_deliveries').insert({ id: key, payload: proposed });
    if (inserted.error && inserted.error.code !== '23505') return reply(500, { error: 'Cannot record delivery' });
    const { data: delivery, error: readError } = await admin.from('email_deliveries').select('*').eq('id', key).single();
    if (readError || !delivery) return reply(500, { error: 'Cannot read delivery' });
    if (delivery.sent_at) return reply(200, { ok: true, already_sent: true });
    // Resend deduplicates retries for 24h. Older uncertain attempts require manual verification.
    if (Date.now() - Date.parse(delivery.created_at) > 23 * 3600 * 1000) return reply(409, { error: 'Verify delivery in provider before retrying' });
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(delivery.payload) });
    if (!response.ok) return reply(502, { error: 'Email provider rejected delivery' });
    const sent = await response.json();
    const recorded = await admin.from('email_deliveries').update({ sent_at: new Date().toISOString(), provider_id: sent.id }).eq('id', key);
    if (recorded.error) return reply(502, { error: 'Delivery accepted, recording failed; retry safely within 23h' });
    return reply(200, { ok: true });
  } catch (_error) { return reply(500, { error: 'Unable to send email' }); }
});
