import { PDFDocument, PDFName, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { receiptPdf } from './receipt-pdf.js';
import { createReceiptDocument } from './receipt-model.js';
import { receiptLogo } from './receipt-logo.js';

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
  const page = pdf.getPage(0);
  if (page.getWidth() !== 576 || page.getHeight() !== 564) throw Error('Expected the site receipt proportions');
  if (!page.node.Resources()?.get(PDFName.of('XObject'))) throw Error('Association logo must be embedded');
  const longAttachment = await receiptPdf({ ...receipt, payer_address: 'Morada extensa de teste '.repeat(500), description: 'Descrição longa '.repeat(500) });
  const longPdf = await PDFDocument.load(longAttachment.content);
  if (longPdf.getPageCount() < 2) throw Error('Long fields must paginate');
});

Deno.test('Site and PDF use one model, retain saved values and escape user text', async () => {
  const receipt = {
    id: 'saved-receipt', receipt_number: 17, receipt_date: '2026-09-10',
    payer_name: '<script>alert("test")</script>', payer_address: 'Morada & localidade',
    receipt_type: 'Donativo', amount: 25, payment_method: 'MB WAY',
    description: 'Donativo guardado', quota_years: [],
  };
  const snapshot = JSON.stringify(receipt);
  const document = await createReceiptDocument(receipt, { PDFDocument, StandardFonts, rgb }, receiptLogo);
  if (document.pages.length !== document.pdf.getPageCount()) throw Error('Screen and PDF pagination must match');
  const svg = document.pages.join('');
  for (const expected of ['N.º 17', '10/09/2026', 'Não sócio', 'Donativo guardado', 'MB WAY', '&lt;script&gt;', '&amp;']) {
    if (!svg.includes(expected)) throw Error('Saved value missing: ' + expected);
  }
  if (svg.includes('<script>')) throw Error('User markup must not become executable HTML');
  if (JSON.stringify(receipt) !== snapshot) throw Error('Rendering must not modify or reissue the saved receipt');
  const attachment = await receiptPdf(receipt);
  if (attachment.filename !== 'recibo-17.pdf') throw Error('Attachment must retain the saved receipt number');
  const long = await createReceiptDocument({ ...receipt, description: 'Texto extenso '.repeat(1500) }, { PDFDocument, StandardFonts, rgb }, receiptLogo);
  if (long.pages.length !== long.pdf.getPageCount() || long.pages.length < 2) throw Error('Long documents must share pagination');
});
