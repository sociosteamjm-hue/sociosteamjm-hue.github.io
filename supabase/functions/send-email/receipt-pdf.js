import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { receiptLogo } from './receipt-logo.js';
import { createReceiptDocument } from './receipt-model.js';

// Render the same document used by the website, from the persisted receipt.
export async function receiptPdf(receipt) {
  const { pdf } = await createReceiptDocument(receipt, { PDFDocument, StandardFonts, rgb }, receiptLogo);
  return {
    filename: 'recibo-' + String(receipt.receipt_number).replace(/[^\w-]/g, '-') + '.pdf',
    content: await pdf.saveAsBase64(), encoding: 'base64', contentType: 'application/pdf',
  };
}
