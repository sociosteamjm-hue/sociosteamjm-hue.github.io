import { acknowledgementEmail, decisionEmail, receiptEmail, contactFooter } from './templates.js';

export function testTemplates() {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const request = { name: 'Ana', request_number: 42, request_type: 'membership', member_number: 7, amount: 12, quota_year: 2026, payment_method: 'MB WAY', status: 'approved' };
  for (const method of ['MB WAY', 'Dinheiro', 'Transferência bancária']) {
    const email = acknowledgementEmail({ ...request, payment_method: method });
    assert(email.text.includes(method) && email.text.includes('PT50 0045 5080 4041 6062 0745 4') && email.text.includes('963 069 801'), 'Payment details');
    assert(email.text.includes('pendente') && email.text.includes('12,00'), 'Pending status and amount');
  }
  assert(decisionEmail(request).text.includes('ano 2026'), 'Paid membership year');
  assert(!decisionEmail({ ...request, amount: null, quota_year: null }).text.includes('Confirmámos o pagamento'), 'Historical unpaid membership');
  assert(decisionEmail({ ...request, request_type: 'quota' }).text.includes('ano 2026'), 'Quota approval');
  assert(decisionEmail({ ...request, request_type: 'donation' }).text.includes('donativo de 12,00'), 'Donation approval');
  assert(decisionEmail({ ...request, status: 'rejected', review_notes: 'Dados incompletos' }).text.includes('Dados incompletos'), 'Rejection reason');
  assert(decisionEmail({ ...request, status: 'rejected' }).text.includes('não o repita'), 'Avoid duplicate payment');
  assert(contactFooter().includes('não responda') && !contactFooter().includes('definir'), 'No placeholder address');
  assert(contactFooter('contact@example.com').includes('contact@example.com'), 'Configured contact');
  assert(receiptEmail({ payer_name: 'Ana', receipt_number: 5, amount: 12, description: 'Quota' }).text.includes('em anexo'), 'PDF email');
  return 'Email template checks passed.';
}
console.log(testTemplates());
