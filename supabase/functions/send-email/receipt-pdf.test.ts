import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { receiptPdf } from './receipt-pdf.js';

Deno.test('Receipt attachment is a readable PDF and paginates long saved fields', async () => {
  const receipt = {
    receipt_number: 1, receipt_date: '2026-09-10', payer_name: 'Sócio de teste',
    payer_tax_id: '123456789', payer_address: 'Rua de Teste, 1, Lisboa',
    member_number: 1, receipt_type: 'Quota', quota_years: [2026],
    payment_method: 'MB WAY', amount: 12, description: 'Quota anual de 2026',
  };
  const attachment = await receiptPdf(receipt);
  if (attachment.filename !== 'recibo-1.pdf' || attachment.contentType !== 'application/pdf') throw Error('Invalid attachment metadata');
  const pdf = await PDFDocument.load(attachment.content);
  if (pdf.getPageCount() !== 1) throw Error('Expected a single page');
  const longAttachment = await receiptPdf({ ...receipt, payer_address: 'Morada extensa de teste '.repeat(500), description: 'Descrição longa '.repeat(500) });
  const longPdf = await PDFDocument.load(longAttachment.content);
  if (longPdf.getPageCount() < 2) throw Error('Long fields must paginate');
});
