import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

// Generate only from the saved receipt snapshot, never from browser form fields.
export async function receiptPdf(receipt) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page, y;
  function newPage() {
    page = pdf.addPage([595.28, 841.89]);
    y = 790;
  }
  function line(value, size = 11, heading = false) {
    // Standard PDF fonts cover Portuguese; preserve supported characters and
    // replace unsupported glyphs visibly rather than failing the entire email.
    const text = Array.from(String(value ?? '')).map(c => {
      if (c === '\n' || c === '\r') return c;
      try { font.encodeText(c); return c; } catch { return '?'; }
    }).join('');
    const face = heading ? bold : font;
    for (const paragraph of text.split(/\r?\n/)) {
      let current = '';
      for (const character of paragraph) {
        if (face.widthOfTextAtSize(current + character, size) > 495) {
          if (y < 55) newPage();
          page.drawText(current, { x: 50, y, size, font: face, color: rgb(0.06, 0.16, 0.26) });
          y -= size + 7;
          current = '';
        }
        current += character;
      }
      if (y < 55) newPage();
      page.drawText(current, { x: 50, y, size, font: face, color: rgb(0.06, 0.16, 0.26) });
      y -= size + 7;
    }
  }
  newPage();
  line('ASSOCIAÇÃO TEAM JM', 20, true);
  line('NIF: 519 312 724');
  line('Rua do Centro, 19 · 2440-210 Reguengo do Fetal');
  line('teamjm29@gmail.com');
  y -= 15;
  line('RECIBO N.º ' + receipt.receipt_number, 17, true);
  const years = receipt.quota_years || (receipt.quota_year ? [receipt.quota_year] : []);
  for (const [label, value] of [
    ['Data', receipt.receipt_date], ['Recebemos de', receipt.payer_name],
    ['NIF/NIPC', receipt.payer_tax_id], ['Morada', receipt.payer_address],
    ['Sócio n.º', receipt.member_number], ['Tipo', receipt.receipt_type],
    ['Anos', years.join(', ')], ['Pagamento', receipt.payment_method],
  ]) line(label + ': ' + (value || '—'));
  y -= 10;
  line('Valor: ' + Number(receipt.amount).toFixed(2).replace('.', ',') + ' EUR', 14, true);
  y -= 10;
  line(receipt.description);
  y -= 15;
  line('Para os devidos efeitos, declara-se recebido o valor acima indicado.');
  pdf.setTitle('Recibo n.º ' + receipt.receipt_number + ' — Associação Team JM');
  pdf.setAuthor('Associação Team JM');
  return { filename: 'recibo-' + String(receipt.receipt_number).replace(/[^\w-]/g, '-') + '.pdf', content: await pdf.saveAsBase64(), encoding: 'base64', contentType: 'application/pdf' };
}
