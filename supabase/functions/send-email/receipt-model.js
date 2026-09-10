// One document model for the website preview, printing and emailed PDF.
// Keep all layout, formatting and pagination here; adapters only render it.
export async function createReceiptDocument(receipt, library, receiptLogo) {
  const { PDFDocument, StandardFonts, rgb } = library;
  const pages = [];
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(receiptLogo);
  const navy = rgb(16 / 255, 42 / 255, 67 / 255);
  const ink = rgb(23 / 255, 32 / 255, 51 / 255);
  const muted = rgb(67 / 255, 83 / 255, 102 / 255);
  const labelColor = rgb(93 / 255, 104 / 255, 120 / 255);
  const border = rgb(203 / 255, 213 / 255, 223 / 255);
  const shade = rgb(241 / 255, 244 / 255, 247 / 255);
  const width = 576, height = 564, left = 32, right = 544;
  let page, top;

  function xml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function color(value) {
    return 'rgb(' + [value.red, value.green, value.blue].map(v => Math.round(v * 255)).join(',') + ')';
  }
  function documentPage(pdfPage) {
    const parts = ['<rect width="100%" height="100%" fill="white"/>'];
    pages.push(parts);
    return {
      drawText(value, options) {
        pdfPage.drawText(value, options);
        const { x, y, size, font } = options;
        const textWidth = font.widthOfTextAtSize(value, size);
        parts.push('<text x="' + x + '" y="' + (height - y) + '" font-family="Arial, Helvetica, sans-serif" font-size="' + size + '" font-weight="' + (font === bold ? '700' : '400') + '" fill="' + color(options.color) + '"' + (textWidth ? ' textLength="' + textWidth + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + xml(value) + '</text>');
      },
      drawImage(image, options) {
        pdfPage.drawImage(image, options);
        parts.push('<image x="' + options.x + '" y="' + (height - options.y - options.height) + '" width="' + options.width + '" height="' + options.height + '" href="data:image/png;base64,' + receiptLogo + '"/>');
      },
      drawLine(options) {
        pdfPage.drawLine(options);
        parts.push('<line x1="' + options.start.x + '" y1="' + (height - options.start.y) + '" x2="' + options.end.x + '" y2="' + (height - options.end.y) + '" stroke="' + color(options.color) + '" stroke-width="' + options.thickness + '"/>');
      },
      drawRectangle(options) {
        pdfPage.drawRectangle(options);
        parts.push('<rect x="' + options.x + '" y="' + (height - options.y - options.height) + '" width="' + options.width + '" height="' + options.height + '" fill="' + color(options.color) + '"/>');
      },
      drawCircle(options) {
        pdfPage.drawCircle(options);
        parts.push('<circle cx="' + options.x + '" cy="' + (height - options.y) + '" r="' + options.size + '" fill="' + color(options.color) + '"/>');
      },
    };
  }

  function safe(value) {
    return Array.from(String(value ?? '')).map(c => {
      if (c === '\n') return c;
      if (c === '\r') return '';
      try { regular.encodeText(c); return c; } catch { return '?'; }
    }).join('');
  }
  function wrap(value, maxWidth, size, font = regular) {
    const lines = [];
    for (const paragraph of safe(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) { line = next; continue; }
        if (line) lines.push(line);
        line = '';
        for (const c of word) {
          if (font.widthOfTextAtSize(line + c, size) > maxWidth) { lines.push(line); line = ''; }
          line += c;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  function text(value, x, y, size = 11, font = regular, color = ink) {
    page.drawText(safe(value), { x, y: height - y - size, size, font, color });
  }
  function alignedRight(value, y, size = 11, font = regular, color = muted) {
    text(value, right - font.widthOfTextAtSize(safe(value), size), y, size, font, color);
  }
  function rule(y, color = border, thickness = 1) {
    page.drawLine({ start: { x: left, y: height - y }, end: { x: right, y: height - y }, thickness, color });
  }
  function footer() {
    rule(505);
    const value = 'ASSOCIAÇÃO TEAM JM · NIF 519 312 724 · IBAN: PT50 0045 5080 4041 6062 0745 4';
    text(value, (width - regular.widthOfTextAtSize(value, 8.3)) / 2, 519, 8.3, regular, labelColor);
  }
  function newPage() {
    page = documentPage(pdf.addPage([width, height]));
    const scale = Math.min(64 / logo.width, 64 / logo.height);
    const lw = logo.width * scale, lh = logo.height * scale;
    page.drawImage(logo, { x: left + (64 - lw) / 2, y: height - 32 - (64 + lh) / 2, width: lw, height: lh });
    text('ASSOCIAÇÃO TEAM JM', 109, 34, 13.12, bold, navy);
    text('Fundada em 22-05-2026 · NIF: 519 312 724', 109, 58, 9.5, regular, muted);
    text('Rua do Centro, 19 · 2440-210 Reguengo do Fetal', 109, 72, 9.5, regular, muted);
    text('teamjm29@gmail.com · 963 069 801', 109, 86, 9.5, regular, muted);
    alignedRight('RECIBO', 35, 20, bold, navy);
    alignedRight('N.º ' + (receipt.receipt_number || '—'), 63, 11.52);
    const date = String(receipt.receipt_date || '').slice(0, 10).split('-');
    alignedRight(date.length === 3 ? date.reverse().join('/') : '—', 81, 11.52);
    rule(121, navy, 3);
    top = 146;
    footer();
  }
  function ensure(space) {
    if (top + space > 478) newPage();
  }
  function paragraph(value, maxWidth = 512, size = 11, font = regular, color = ink, x = left) {
    const lineHeight = size * 1.55;
    for (const line of wrap(value, maxWidth, size, font)) {
      ensure(lineHeight);
      text(line, x, top, size, font, color);
      top += lineHeight;
    }
  }

  newPage();
  text('RECEBEMOS DE', left, top, 10.72, regular, labelColor);
  alignedRight('SÓCIO N.º', top, 10.72, regular, labelColor);
  top += 19;
  alignedRight(String(receipt.member_number || (receipt.receipt_type === 'Donativo' ? 'Não sócio' : '—')), top, 14.08, bold, ink);
  paragraph(receipt.payer_name || '—', 400, 14.08, bold);
  paragraph('NIF / NIPC: ' + (receipt.payer_tax_id || '—'), 400, 10.72, regular, labelColor);
  paragraph('Morada: ' + (receipt.payer_address || '—'), 400, 10.72, regular, labelColor);
  top += 18;

  const years = receipt.quota_years || (receipt.quota_year ? [receipt.quota_year] : []);
  const columns = [
    ['TIPO', receipt.receipt_type || '—'],
    ['ANO(S) DA QUOTA', years.join(', ') || '—'],
    ['PAGAMENTO', receipt.payment_method || '—'],
  ];
  const rows = columns.map(([, value]) => wrap(value, 150, 12.48, bold));
  let offset = 0;
  const total = Math.max(...rows.map(lines => lines.length));
  while (offset < total) {
    ensure(67);
    const count = Math.min(total - offset, Math.max(1, Math.floor((478 - top - 46) / 19)));
    const boxHeight = 46 + count * 19;
    const radius = 5.6, bottom = height - top - boxHeight;
    page.drawRectangle({ x: left + radius, y: bottom, width: 512 - 2 * radius, height: boxHeight, color: shade });
    page.drawRectangle({ x: left, y: bottom + radius, width: 512, height: boxHeight - 2 * radius, color: shade });
    for (const x of [left + radius, right - radius]) for (const y of [bottom + radius, bottom + boxHeight - radius]) page.drawCircle({ x, y, size: radius, color: shade });
    columns.forEach(([label], i) => {
      const x = left + 14.4 + i * 166;
      text(label, x, top + 15, 10.72, regular, labelColor);
      rows[i].slice(offset, offset + count).forEach((line, j) => text(line, x, top + 36 + j * 19, 12.48, bold));
    });
    top += boxHeight + 20;
    offset += count;
  }

  const amount = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(receipt.amount));
  const amountWidth = bold.widthOfTextAtSize(safe(amount), 21.6);
  const descriptionWidth = Math.min(405, 512 - amountWidth - 24);
  ensure(65);
  text('DESCRIÇÃO / REFERÊNCIA', left, top, 10.72, regular, labelColor);
  top += 21;
  alignedRight(amount, top, 21.6, bold, navy);
  paragraph(receipt.description || '—', descriptionWidth, 15, bold);
  top += 20;
  ensure(65);
  rule(top);
  top += 25;
  paragraph('Para os devidos efeitos, declara-se recebido o valor acima indicado.', 512, 11.52, regular, muted);
  pdf.setTitle('Recibo n.º ' + receipt.receipt_number + ' — Associação Team JM');
  pdf.setAuthor('Associação Team JM');
  return { pdf, pages: pages.map(parts => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Recibo" class="receipt-document-page">' + parts.join('') + '</svg>') };
}
